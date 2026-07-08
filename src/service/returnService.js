import { config } from '#config/config.js';
import Order from '../models/Orders.js';
import Return from '../models/Return.js';
import Seller from '#root/src/models/Seller.js';
import Product from '../models/Product.js';
import PickupAddress from '../models/PickUpAddress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
import { syncSellerOrdersFromOrder } from '#root/src/service/sellerOrderService.js';
import mongoose from 'mongoose';
import { formatDateTime } from '#root/src/helpers/Common.js';
import {
  sanitizeReturnData,
  getOrderDataByOrderLineIds,
  buildReturnAggregationPipeline,
  buildReturnMatchAndPipeline,
  formatReturnDetails,
} from '#helpers/ReturnHandler.js';
import {
  generateCSVFilename,
  createCSVExportResponse,
  validateExportData,
  generateDynamicHeaders,
  generateDynamicRowData,
} from '#helpers/export.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { RETURN_STATUS } from '#constants/common.js';
import { syncReturnShipmentStatus } from '#service/shipmentService.js';
import Channel from '../models/Channel.js';
import { channelEnginePush } from '#service/channelEngineClient.js';
import { CE_QUEUE_OPERATIONS } from '#constants/channelEngineQueue.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

//Fetches returns from ChannelEngine and saves them to the database.

export const getReturns = async (queryParams = {}) => {
  try {
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    let totalProcessed = 0;
    let totalUpserted = 0;
    let totalModified = 0;

    while (hasMore) {
      const params = new URLSearchParams({
        ...queryParams,
        apikey: CHANNEL_ENGINE_API_KEY,
        page,
        pageSize,
      });

      const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}returns?${params.toString()}`);

      if (!response.ok) {
        return {
          success: false,
          message: `ChannelEngine API error: ${response.status}`,
        };
      }

      const responseData = await response.json();
      const { Content = [] } = responseData;

      if (!Content.length) {
        hasMore = false;
        break;
      }

      const bulkOps = [];
      const normalizedReturns = []; //  for order updates

      for (const returnData of Content) {
        // Sanitize return data using helper
        const sanitizationResult = await sanitizeReturnData(returnData, Order);
        if (!sanitizationResult.success) {
          console.warn('Sanitization failed for return:', returnData?.Id);
          continue;
        }

        const simplifiedReturnDocument = sanitizationResult.data;

        // Add bulk upsert operation
        bulkOps.push({
          updateOne: {
            filter: {
              returnId: simplifiedReturnDocument.returnId,
            },
            update: {
              $set: simplifiedReturnDocument,
            },
            upsert: true,
          },
        });

        //  Prepare for Order SKU update
        if (Array.isArray(simplifiedReturnDocument.products)) {
          for (const product of simplifiedReturnDocument.products) {
            normalizedReturns.push({
              returnId: simplifiedReturnDocument.returnId,
              orderId: simplifiedReturnDocument.orderId,

              //  IMPORTANT: match with your Order schema field
              channelOrderLineNo: String(product.orderLineId),

              quantity: product.quantity || 0,
            });
          }
        }
      }

      if (bulkOps.length > 0) {
        const result = await Return.bulkWrite(bulkOps);

        totalUpserted += result.upsertedCount || 0;
        totalModified += result.modifiedCount || 0;

        //  Update SKU breakdown in Orders
        if (normalizedReturns.length > 0) {
          await applyReturnToOrder(normalizedReturns);
        }
      }

      totalProcessed += Content.length;

      // stop when last page reached
      if (Content.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return {
      success: true,
      data: {
        totalProcessed,
        totalUpserted,
        totalModified,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error communicating with ChannelEngine.',
      error: error.message,
    };
  }
};

//Saves return data to the database with simplified structure.
export const saveReturnToDatabase = async (returnData) => {
  try {
    // --- Step 1: Sanitize data ---
    const sanitizationResult = await sanitizeReturnData(returnData, Order);
    if (!sanitizationResult.success) {
      return sanitizationResult;
    }

    const simplifiedReturnDocument = sanitizationResult.data;

    // --- Step 2: Check if return already exists ---
    const existingReturn = await Return.findOne({ returnId: simplifiedReturnDocument.returnId }).lean();
    // --- Step 3: Add logs only if new or logs don't exist ---
    if (!existingReturn || !existingReturn.logs || existingReturn.logs.length === 0) {
      simplifiedReturnDocument.logs = [
        {
          status: 'CREATED',
          description: 'Return Placed',
          createdAt: new Date(
            simplifiedReturnDocument?.ReturnDate || simplifiedReturnDocument?.returnDate || Date.now()
          ),
        },
      ];
    } else {
      // Keep existing logs as-is (don’t overwrite)
      delete simplifiedReturnDocument.logs;
    }

    // --- Step 4: Upsert (create/update) the document ---
    await Return.findOneAndUpdate(
      { returnId: simplifiedReturnDocument.returnId },
      { $set: simplifiedReturnDocument },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
    return { success: true };
  } catch (error) {
    console.error('Error in saveReturnToDatabase:', error.message);
    return { success: false, message: 'Error saving return to database', error: error.message };
  }
};

//Gets returns from the database with pagination and filtering using aggregation.

export const getReturnsFromDatabase = async (query = {}, sellerId = null) => {
  try {
    const {
      status,
      platform,
      search,
      size = 100000,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      page = 1,
      channel,
    } = query;

    //   pass sellerId separately (so sellerStatus filter works)
    const queryObj = {
      channel,
      status,
      platform,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      size,
      page,
    };

    const skip = (parseInt(page, 10) - 1) * parseInt(size, 10);
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const { pipeline } = await buildReturnMatchAndPipeline(queryObj, {
      includeSearchNameSplit: true,
    });
    const appliedFilters = {};

    //  Apply channel filter early
    let channelIdsFromName = [];

    if (channel) {
      const channelNames = channel
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const regexArray = channelNames.map((name) => ({
        channelName: { $regex: name, $options: 'i' },
      }));

      const matchedChannels = await Channel.find({ $or: regexArray }).select('channelId').lean();

      channelIdsFromName = matchedChannels.map((c) => c.channelId);

      pipeline.push({
        $match: { channelId: { $in: channelIdsFromName } },
      });

      appliedFilters.channel = channel;
    }

    let sellerObjectId = null;

    if (sellerId && sellerId !== 'null' && sellerId !== 'undefined' && mongoose.Types.ObjectId.isValid(sellerId)) {
      sellerObjectId = new mongoose.Types.ObjectId(String(sellerId));

      pipeline.push({
        $match: {
          $or: [{ sellerIds: { $in: [sellerObjectId] } }, { sellerIds: { $exists: false } }],
        },
      });
    }

    //  STATUS FILTER (Seller-specific)
    if (status) {
      const statusArray = status
        .toString()
        .split(',')
        .map((s) => s.trim().toUpperCase());

      const invalid = statusArray.filter((s) => !Object.values(RETURN_STATUS).includes(s));

      if (invalid.length > 0) {
        throw new Error(
          `Invalid status: ${invalid.join(', ')}. Valid statuses are: ${Object.values(RETURN_STATUS).join(', ')}`
        );
      }

      appliedFilters.status = status;

      if (sellerObjectId) {
        pipeline.push({
          $match: {
            $or: [
              {
                sellerStatuses: {
                  $elemMatch: {
                    sellerId: sellerObjectId,
                    status: { $in: statusArray },
                  },
                },
              },
              // fallback for old data
              { sellerStatuses: { $exists: false }, status: { $in: statusArray } },
            ],
          },
        });
      } else {
        pipeline.push({
          $match: {
            status: { $in: statusArray },
          },
        });
      }
    }

    // Normalize fields
    pipeline.push({
      $addFields: {
        orderID: { $ifNull: ['$orderId', '$orderInfo.orderId'] },
        placedOn: { $ifNull: ['$placedOn', '$createdAt'] },
      },
    });

    // Customer extraction
    pipeline.push({
      $addFields: {
        customer: {
          firstName: { $ifNull: ['$orderInfo.orderCustomer.firstName', 'NA'] },
          lastName: { $ifNull: ['$orderInfo.orderCustomer.lastName', 'NA'] },
          email: { $ifNull: ['$orderInfo.orderCustomer.email', 'NA'] },
          phone: { $ifNull: ['$orderInfo.orderCustomer.phone', 'NA'] },
        },
      },
    });

    // Sorting
    let actualSortBy = sortBy;

    if (sortBy === 'returnId') {
      pipeline.push({
        $addFields: {
          returnIdNumeric: { $toInt: '$returnId' },
        },
      });
      actualSortBy = 'returnIdNumeric';
    }

    const countPipeline = [...pipeline, { $count: 'total' }];

    pipeline.push({ $sort: { [actualSortBy]: sortDirection } }, { $skip: skip }, { $limit: parseInt(size, 10) });

    const [results, countResult, allChannelImage] = await Promise.all([
      Return.aggregate(pipeline),
      Return.aggregate(countPipeline),
      Channel.find().select('-_id channelId channelImageUrl').lean(),
    ]);

    const channelMap = {};
    allChannelImage.forEach((channel) => {
      channelMap[channel.channelId] = channel.channelImageUrl;
    });

    const totalReturns = countResult?.[0]?.total || 0;

    const formattedReturns = results.map((r) => {
      const sellerObjectIdStr = sellerObjectId ? String(sellerObjectId) : null;

      const orderSkuMap = new Map(
        (r.orderInfo?.orderSkuList?.skuList || []).map((sku) => [sku.merchantProductNo, sku])
      );

      const sellerProducts = (r.products || []).filter((p) => {
        if (!sellerObjectIdStr) return true;
        const orderSku = orderSkuMap.get(p.productSkuCode);
        return orderSku && String(orderSku.sellerId) === sellerObjectIdStr;
      });

      //  Seller-specific status logic
      let sellerStatus = r.status || 'NA';

      if (sellerObjectIdStr && Array.isArray(r.sellerStatuses)) {
        const sellerStatusObj = r.sellerStatuses.find((s) => String(s.sellerId) === sellerObjectIdStr);

        if (sellerStatusObj?.status) {
          sellerStatus = sellerStatusObj.status;
        } else {
          sellerStatus = 'IN_PROGRESS';
        }
      }

      const mappedProducts = sellerProducts.map((p) => {
        const quantity = p.quantity || 0;
        const orderSku = orderSkuMap.get(p.productSkuCode);

        let productPrice = 0;
        if (orderSku?.originalUnitPriceInclVat) {
          productPrice = orderSku.originalUnitPriceInclVat;
        } else if (p.price) {
          productPrice = p.price;
        }

        return {
          quantity,
          totalPrice: productPrice * quantity,
        };
      });

      const totalQuantity = mappedProducts.reduce((sum, p) => sum + p.quantity, 0);
      const totalPrice = mappedProducts.reduce((sum, p) => sum + p.totalPrice, 0);

      return {
        _id: r._id,
        returnId: r.returnId || 'NA',
        orderID: r.orderID || 'NA',
        channelId: r.channelId,
        channelImage: channelMap[r.channelId] || 'NA',

        //  UPDATED STATUS
        status: sellerStatus,

        platform: r.platform || 'NA',
        placedOn: r.placedOn || 'NA',

        quantity: totalQuantity,
        totalPrice,
        sellerId,

        reason: r.reason || 'NA',
        customerComment: r.customerComment || 'NA',
        merchantComment: r.merchantComment || 'NA',

        customerInfo: {
          name: `${r.orderInfo?.orderCustomer?.firstName || 'NA'} ${r.orderInfo?.orderCustomer?.lastName || ''}`.trim(),
          email: r.orderInfo?.orderCustomer?.email || 'NA',
          phoneNo: r.orderInfo?.orderCustomer?.phone || 'NA',
        },
      };
    });

    return {
      success: formattedReturns.length > 0,
      data: formattedReturns,
      pagination: getPagination(totalReturns, page, size),
      appliedFilters,
    };
  } catch (err) {
    console.error('Error fetching returns:', err);
    return { success: false, message: err.message };
  }
};

export const getReturnStats = async (query = {}) => {
  try {
    const { pipeline } = buildReturnMatchAndPipeline(query);

    pipeline.push({
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    });

    const statusStats = await Return.aggregate(pipeline);

    // Initialize stats with all return statuses set to 0
    const stats = Object.values(RETURN_STATUS).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});

    // Update stats with actual counts from database
    statusStats.forEach(({ _id, count }) => {
      if (_id && stats[_id] !== undefined) {
        stats[_id] = count;
      }
    });

    return { stats };
  } catch (error) {
    console.error('Error getting return stats:', error.message);
    throw error;
  }
};

//Creates a return in ChannelEngine.
export const createReturn = async (returnData) => {
  try {
    const response = await channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_MERCHANT_CREATE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}returns/merchant?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: returnData,
    });

    const responseData = response.data || {};

    if (response.status === 409) {
      return {
        isConflict: true,
        data: null,
        message: responseData.Message || 'Return with this reference already exists',
      };
    }

    if (!response.ok) {
      return {
        isConflict: false,
        data: null,
        message: responseData.Message || `ChannelEngine API error: ${response.status}`,
        statusCode: response.status,
        error: responseData,
      };
    }

    return {
      isConflict: false,
      data: responseData,
    };
  } catch (error) {
    return {
      isConflict: false,
      data: null,
      message: 'Error communicating with ChannelEngine.',
      error: error.message,
    };
  }
};
//Sends an acknowledgement for a merchant return to ChannelEngine.
export const acknowledgeReturn = async (ackData) => {
  try {
    const response = await channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_MERCHANT_ACKNOWLEDGE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}returns/merchant/acknowledge?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: ackData,
    });

    const responseData = response.data || {};

    if (!response.ok) {
      return {
        success: false,
        message: responseData.Message || `ChannelEngine API error: ${response.status} ${response.statusText}`,
        error: responseData,
      };
    }

    return { success: true, data: responseData };
  } catch (error) {
    console.error('Error in acknowledgeReturn:', error.message);
    return {
      success: false,
      message: 'Error communicating with ChannelEngine.',
      error: error.message,
    };
  }
};

export const acceptOrRejectReturn = async (returnData) => {
  try {
    const response = await channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_ACCEPT_REJECT,
      method: 'PUT',
      url: `${CHANNEL_ENGINE_BASE_URL}returns?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: returnData,
    });

    const responseData = response.data || {};

    if (response.status === 409) {
      return {
        success: false,
        isConflict: true,
        message: responseData.Message || 'Return with this reference already exists',
        error: responseData,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        message: responseData.Message || `ChannelEngine API error: ${response.status}`,
        statusCode: response.status,
        error: responseData,
      };
    }

    return { success: true, data: responseData };
  } catch (error) {
    console.error('Error in acceptOrRejectReturn:', error.message);
    return {
      success: false,
      message: 'Error communicating with ChannelEngine.',
      error: error.message,
    };
  }
};
export const getReturnById = async (id, sellerId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const returnDataCheck = await Return.findById(id).lean();
    if (!returnDataCheck) return null;

    await syncReturnShipmentStatus(id);

    //  Proper sellerId validation
    let sellerObjectId = null;

    if (sellerId && sellerId !== 'null' && sellerId !== 'undefined' && mongoose.Types.ObjectId.isValid(sellerId)) {
      sellerObjectId = new mongoose.Types.ObjectId(sellerId);
    }

    const matchStage = {
      _id: new mongoose.Types.ObjectId(id),
    };

    //  Filter by seller products if sellerId present
    if (sellerObjectId) {
      matchStage['products.sellerId'] = sellerObjectId;
    }

    const [returnData] = await Return.aggregate([
      { $match: matchStage },

      ...(sellerObjectId
        ? [
            {
              $addFields: {
                products: {
                  $filter: {
                    input: '$products',
                    as: 'product',
                    cond: {
                      $eq: ['$$product.sellerId', sellerObjectId],
                    },
                  },
                },
              },
            },
            { $match: { products: { $ne: [] } } },
          ]
        : []),

      {
        $lookup: {
          from: 'shipments',
          let: { shipment_ids: '$shipmentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$_id', { $ifNull: ['$$shipment_ids', []] }] },
                    ...(sellerObjectId ? [{ $eq: ['$sellerId', sellerObjectId] }] : []),
                    { $eq: ['$type', 'REVERSE'] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                airWaybillNo: 1,
                merchantShipmentNo: 1,
                status: 1,
                createdAt: 1,
                _id: 1,
                deliveryId: 1,
              },
            },
          ],
          as: 'shipmentData',
        },
      },
      {
        $unwind: {
          path: '$shipmentData',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Product lookup for images
      {
        $lookup: {
          from: 'products',
          let: { skuCodes: '$products.productSkuCode' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$productSkuCode', { $ifNull: ['$$skuCodes', []] }],
                },
              },
            },
            {
              $project: {
                productSkuCode: 1,
                primaryImageUrl: 1,
                imageUrl: 1,
                images: 1,
              },
            },
          ],
          as: 'productData',
        },
      },
    ]);

    if (!returnData) return null;

    //  NEW: Seller-specific status logic
    let finalStatus = returnData.status || 'NA';

    if (sellerObjectId && Array.isArray(returnData.sellerStatuses)) {
      const sellerStatusObj = returnData.sellerStatuses.find((s) => String(s.sellerId) === String(sellerObjectId));

      if (sellerStatusObj?.status) {
        finalStatus = sellerStatusObj.status;
      } else {
        finalStatus = 'IN_PROGRESS'; // fallback if seller not found
      }
    }

    //  Fetch order info
    const orderLineIds = returnData.products?.map((p) => p.orderLineId).filter(Boolean) || [];

    let orderInfo = null;

    if (orderLineIds.length > 0) {
      orderInfo = await getOrderDataByOrderLineIds(orderLineIds, Order, {
        orderId: 1,
        subTotalExclVat: 1,
        subTotalVat: 1,
        shippingCostsExclVat: 1,
        shippingCostsVat: 1,
        orderSkuList: 1,
        _id: 1,
        orderShippingAddress: 1,
        orderCustomer: 1,
        orderPaymentDetails: 1,
      });
    }
    const skuCodes = returnData.products?.map((p) => p.productSkuCode).filter(Boolean) || [];
    const productImages = skuCodes.length
      ? await Product.find({ productSkuCode: { $in: skuCodes } })
          .select('productSkuCode imageUrl')
          .lean()
      : [];
    const imageMap = Object.fromEntries(productImages.map((p) => [p.productSkuCode, p.imageUrl ?? null]));

    const returnLogsData = returnData?.logs?.length ? formatReturnTrackingInf(returnData.logs) : [];

    const aggregatedResult = {
      ...returnData,
      status: finalStatus, //  override with seller-specific status
      orderInfo,
      returnLogsData,
      omniful: returnData.omniful || null,
    };

    return formatReturnDetails(aggregatedResult, imageMap);
  } catch (error) {
    console.error('Error fetching return by ID:', error.message);
    throw error;
  }
};
export const formatReturnTrackingInf = (data) => {
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((item) => {
    const formatted = formatDateTime(item?.createdAt);

    return {
      status: item?.description || '',
      date: formatted?.date || '',
      time: formatted?.time || '',
    };
  });
};
export const exportReturnsToCSV = async (sellerId, filters = {}) => {
  try {
    if (!sellerId) {
      return { success: false, message: 'Seller ID is required for export' };
    }

    let sellerName = '';

    const seller = await Seller.findById(sellerId).select('name');
    sellerName = seller?.name || '';

    const safeSellerName = sellerName
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const {
      status,
      platform,
      search,
      size = 100000,
      sortBy = 'CreatedAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      page = 1,
      channel,
    } = filters;

    //   pass sellerId separately (so sellerStatus filter works)
    const queryObj = {
      channel,
      status,
      platform,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      size,
      page,
    };

    const basicResult = await getReturnsFromDatabase(queryObj, sellerId);

    const validation = validateExportData(basicResult.data, 'returns');
    if (!validation.success) return validation;

    const returnIds = basicResult.data
      .map((r) => {
        try {
          return new mongoose.Types.ObjectId(r._id);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (!returnIds.length) {
      return {
        success: false,
        message: 'No return records found to export.',
        data: [],
      };
    }

    const pickupModelFields = generateDynamicHeaders(PickupAddress)?.filter((h) => h !== '_id') || [];
    const deliveryModelFields = generateDynamicHeaders(DeliveryAddress)?.filter((h) => h !== '_id') || [];

    const pipeline = typeof buildReturnAggregationPipeline === 'function' ? buildReturnAggregationPipeline() : [];
    pipeline.push({ $match: { _id: { $in: returnIds } } });

    pipeline.push({ $addFields: { shipment: { $arrayElemAt: ['$shipments', 0] } } });

    pipeline.push({
      $addFields: {
        shipment: {
          $cond: [
            { $ifNull: ['$shipment', false] },
            { pickUpId: '$shipmentData.pickUpId', deliveryId: '$shipmentData.deliveryId' },
            null,
          ],
        },
      },
    });

    const pickupCollectionName = PickupAddress?.collection?.collectionName || 'pickupaddresses';
    const deliveryCollectionName = DeliveryAddress?.collection?.collectionName || 'deliveryaddresses';

    // lookup pickup
    pipeline.push({
      $lookup: {
        from: pickupCollectionName,
        let: { pickupId: '$shipmentData.deliveryId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $ne: ['$$pickupId', null] }, { $eq: ['$_id', '$$pickupId'] }],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'pickupAddress',
      },
    });

    // lookup delivery
    pipeline.push({
      $lookup: {
        from: deliveryCollectionName,
        let: { deliveryId: '$shipmentData.pickUpId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $ne: ['$$deliveryId', null] }, { $eq: ['$_id', '$$deliveryId'] }],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'deliveryAddress',
      },
    });
    pipeline.push({
      $addFields: {
        'shipment.pickupAddress': { $arrayElemAt: ['$pickupAddress', 0] },
        'shipment.deliveryAddress': { $arrayElemAt: ['$deliveryAddress', 0] },
      },
    });
    pipeline.push({ $project: { shipments: 0, pickupAddress: 0, deliveryAddress: 0 } });

    const aggregated = await Return.aggregate(pipeline).allowDiskUse(true);

    const returnHeadersRaw = generateDynamicHeaders(Return);

    const returnHeaders = returnHeadersRaw.filter(
      (h) =>
        h !== 'sellerIds' &&
        h !== 'products' &&
        h !== 'logs' &&
        h !== 'omniful' &&
        h !== 'shipmentId' &&
        h !== 'sellerStatuses'
    );

    const finalReturnHeaders = [...returnHeaders];
    finalReturnHeaders.splice(1, 0, 'sellerId');
    const productHeaders = [
      'productSkuCode',
      'orderLineId',
      'quantity',
      'acceptedQuantity',
      'rejectedQuantity',
      'unitPrice',
      'totalPrice',
    ];
    const csvHeaders = [
      ...finalReturnHeaders,
      ...productHeaders,
      'pickUpId',
      'deliveryId',
      ...deliveryModelFields.map((h) => `pickup_${h}`),
      ...pickupModelFields.map((h) => `delivery_${h}`),
    ];

    const simpleFormat = (v) => {
      if (v === undefined || v === null) return '';
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    };

    const mapModelFields = (doc, fields) => {
      if (!doc) return fields.map(() => '');
      return fields.map((f) => {
        const parts = String(f).split('.');
        let cur = doc;
        for (const p of parts) {
          if (cur == null) break;
          cur = cur[p];
        }
        return simpleFormat(cur);
      });
    };

    const csvRows = [csvHeaders.join(',')];

    for (const doc of aggregated) {
      const filteredProducts = (doc.products || []).filter((p) => String(p.sellerId) === String(sellerId));

      if (!filteredProducts.length) continue;

      let isFirstRow = true;

      for (const product of filteredProducts) {
        const tempDoc = { ...doc, products: [product] };

        // SELLER STATUS OVERRIDE
        let sellerStatus = doc.status || 'NA';

        if (Array.isArray(doc.sellerStatuses)) {
          const sellerStatusObj = doc.sellerStatuses.find((s) => String(s.sellerId) === String(sellerId));

          if (sellerStatusObj?.status) {
            sellerStatus = sellerStatusObj.status;
          } else {
            sellerStatus = 'IN_PROGRESS';
          }
        }

        tempDoc.status = sellerStatus;

        let baseRow = generateDynamicRowData(tempDoc, Return, [
          'products',
          'logs',
          'omniful',
          'shipmentId',
          'sellerStatuses',
        ]);

        const sellerIdsIndex = returnHeadersRaw.indexOf('sellerIds');
        if (sellerIdsIndex !== -1) baseRow.splice(sellerIdsIndex, 1);

        const returnIdIndex = returnHeaders.indexOf('returnId');
        if (!isFirstRow && returnIdIndex !== -1) {
          baseRow[returnIdIndex] = '';
        }

        const shipmentRow = [doc?.shipment?.pickUpId?.toString(), doc?.shipment?.deliveryId?.toString()];
        const pickupRow = mapModelFields(doc?.shipment?.pickupAddress, pickupModelFields);
        const deliveryRow = mapModelFields(doc?.shipment?.deliveryAddress, deliveryModelFields);

        const totalPrice = (product.quantity || 0) * (product.price || 0);

        const productRow = [
          simpleFormat(product.productSkuCode),
          simpleFormat(product.orderLineId),
          simpleFormat(product.quantity),
          simpleFormat(product.acceptedQuantity),
          simpleFormat(product.rejectedQuantity),
          simpleFormat(product.price),
          simpleFormat(totalPrice),
        ];
        const fullRowArray = [
          baseRow[0],
          String(sellerId),
          ...baseRow.slice(1),
          ...productRow,
          ...shipmentRow,
          ...deliveryRow,
          ...pickupRow,
        ];

        const csvLine = fullRowArray
          .map((v) => {
            const s = simpleFormat(v);
            if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(',');

        csvRows.push(csvLine);

        isFirstRow = false;
      }
    }

    const datePart = new Date().toISOString().split('T')[0];

    const filename =
      typeof generateCSVFilename === 'function'
        ? generateCSVFilename(`returns-${safeSellerName}`)
        : `returns-${safeSellerName}-${datePart}.csv`;

    return createCSVExportResponse(csvRows, filename, csvRows.length - 1);
  } catch (err) {
    console.error('Error exporting returns :', err?.message, err?.stack);
    throw err;
  }
};

export const getReturnsForWebhook = async (queryParams = {}) => {
  try {
    const params = new URLSearchParams({
      ...queryParams,
      apikey: `${CHANNEL_ENGINE_API_KEY}`,
    });

    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}returns?${params.toString()}`);
    const responseData = await response.json();
    if (!response.ok) {
      return {
        success: false,
        message: `ChannelEngine API error: ${response.status}`,
        error: responseData,
      };
    }

    let { Content = [] } = responseData;
    if (!Content.length) return { success: true, data: [] };

    // Sort by CreatedAt descending (latest first)
    Content = Content.sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0));

    // Take only the latest 10
    const latest10 = Content.slice(0, 10);

    console.log(`Fetched ${Content.length} returns, saving latest ${latest10.length}`);

    // Save only these 10 in batches
    const batchSize = 5;
    for (let i = 0; i < latest10.length; i += batchSize) {
      const chunk = latest10.slice(i, i + batchSize);
      await Promise.allSettled(chunk.map(saveReturnToDatabase));
    }

    return { success: true, data: latest10 };
  } catch (error) {
    return {
      success: false,
      message: 'Error communicating with ChannelEngine.',
      error: error.message,
    };
  }
};

export const applyReturnToOrder = async (returns = []) => {
  try {
    if (!returns.length) {
      console.log(' No returns received');
      return;
    }

    const bulkOps = [];
    const orderIdsToSync = new Set();

    //  STEP 1: Aggregate returns per orderId + lineId
    const returnMap = {};

    for (const ret of returns) {
      const { orderId, channelOrderLineNo, quantity = 0, returnId } = ret;

      if (!orderId || !channelOrderLineNo) {
        console.warn(' Skipping invalid return:', ret);
        continue;
      }

      const lineId = Number(channelOrderLineNo);
      const key = `${orderId}_${lineId}`;

      if (!returnMap[key]) {
        returnMap[key] = {
          orderId,
          lineId,
          quantity: 0,
          returnIds: [],
        };
      }

      returnMap[key].quantity += quantity;
      returnMap[key].returnIds.push(returnId);
    }

    //  STEP 2: Build bulkOps using aggregated values
    for (const key in returnMap) {
      const { orderId, lineId, quantity } = returnMap[key];

      //  REPLACE returned value (not increment)
      const updateOperation = [
        {
          $set: {
            'orderSkuList.skuList': {
              $map: {
                input: '$orderSkuList.skuList',
                as: 'sku',
                in: {
                  $cond: [
                    { $eq: ['$$sku.id', lineId] },

                    {
                      $mergeObjects: [
                        '$$sku',
                        {
                          statusBreakdown: {
                            $mergeObjects: [
                              '$$sku.statusBreakdown',
                              {
                                returned: quantity,
                              },
                            ],
                          },

                          status: {
                            $cond: [
                              {
                                $eq: [quantity, '$$sku.quantity'],
                              },
                              'RETURNED',
                              '$$sku.status',
                            ],
                          },
                        },
                      ],
                    },

                    '$$sku',
                  ],
                },
              },
            },
          },
        },
      ];

      bulkOps.push({
        updateOne: {
          filter: {
            orderId,
            'orderSkuList.skuList.id': lineId,
          },
          update: updateOperation,
        },
      });

      orderIdsToSync.add(orderId);
    }

    if (bulkOps.length) {
      await Order.bulkWrite(bulkOps);

      //  Sync sellers
      const orderDocs = await Order.find({ orderId: { $in: [...orderIdsToSync] } }, { _id: 1 }).lean();

      const orderIdsArray = orderDocs.map((o) => o._id);

      for (const id of orderIdsArray) {
        await syncSellerOrdersFromOrder(id);
      }
    }

    return true;
  } catch (err) {
    console.error(' Error updating order SKU returns:', err);
  }
};
export default {
  getReturns,
  getReturnsFromDatabase,
  saveReturnToDatabase,
  createReturn,
  getReturnStats,
  acknowledgeReturn,
  acceptOrRejectReturn,
  getReturnById,
  getReturnsForWebhook,
  exportReturnsToCSV,
};
