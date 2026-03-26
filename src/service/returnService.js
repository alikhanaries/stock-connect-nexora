import { config } from '#config/config.js';
import Order from '../models/Orders.js';
import Return from '../models/Return.js';
import Shipment from '../models/Shipment/Shipment.js';
import PickupAddress from '../models/PickUpAddress.js';
import DeliveryAddress from '../models/Shipment/DeliveryAdress.js';
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

      for (const returnData of Content) {
        // Sanitize return data using helper
        const sanitizationResult = await sanitizeReturnData(returnData, Order);
        if (!sanitizationResult.success) {
          console.warn('Sanitization failed for return:', returnData.Id);
          continue;
        }

        const simplifiedReturnDocument = sanitizationResult.data;

        // Add bulk upsert operation
        bulkOps.push({
          updateOne: {
            filter: { returnId: simplifiedReturnDocument.returnId },
            update: { $set: simplifiedReturnDocument },
            upsert: true,
          },
        });
      }

      if (bulkOps.length > 0) {
        const result = await Return.bulkWrite(bulkOps);

        totalUpserted += result.upsertedCount || 0;
        totalModified += result.modifiedCount || 0;
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
    const { status, sortOrder = 'desc', sortBy = 'placedOn', page = 1, size = 10, channelId, platform, search } = query;

    const skip = (parseInt(page, 10) - 1) * parseInt(size, 10);
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    if (channelId) appliedFilters.channelId = channelId;
    if (platform) appliedFilters.platform = platform;

    const { pipeline } = buildReturnMatchAndPipeline(query, {
      includeSearchNameSplit: true,
    });

    // Validate status if provided
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

      appliedFilters.status = statusArray;

      // APPLY FILTER IN PIPELINE
      pipeline.push({
        $match: {
          status: { $in: statusArray },
        },
      });
    }
    //  Filter by sellerId
    if (sellerId && sellerId !== 'null' && sellerId !== 'undefined' && mongoose.Types.ObjectId.isValid(sellerId)) {
      const sellerObjectId = new mongoose.Types.ObjectId(String(sellerId));

      pipeline.push({
        $match: {
          $or: [{ sellerIds: { $in: [sellerObjectId] } }, { sellerIds: { $exists: false } }],
        },
      });
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');

      const searchConditions = [
        { returnId: { $regex: searchRegex } },
        { orderId: { $regex: searchRegex } },

        // Customer search
        { 'orderInfo.orderCustomer.firstName': { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.lastName': { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.email': { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.phone': { $regex: searchRegex } },
      ];

      const searchTerms = search.trim().split(/\s+/);

      if (searchTerms.length > 1) {
        const [firstTerm, ...rest] = searchTerms;
        const lastTerm = rest.join(' ');

        const firstRegex = new RegExp(firstTerm, 'i');
        const lastRegex = new RegExp(lastTerm, 'i');

        searchConditions.push(
          {
            $and: [
              { 'orderInfo.orderCustomer.firstName': firstRegex },
              { 'orderInfo.orderCustomer.lastName': lastRegex },
            ],
          },
          {
            $and: [
              { 'orderInfo.orderCustomer.lastName': firstRegex },
              { 'orderInfo.orderCustomer.firstName': lastRegex },
            ],
          }
        );
      }

      pipeline.push({
        $match: {
          $or: searchConditions,
        },
      });
    }

    // Normalize fields
    pipeline.push({
      $addFields: {
        orderID: { $ifNull: ['$orderId', '$orderInfo.orderId'] },
        placedOn: { $ifNull: ['$placedOn', '$createdAt'] },
      },
    });

    // Customer extraction from orderInfo
    pipeline.push({
      $addFields: {
        customer: {
          firstName: {
            $ifNull: ['$orderInfo.orderCustomer.firstName', 'NA'],
          },
          lastName: {
            $ifNull: ['$orderInfo.orderCustomer.lastName', 'NA'],
          },
          email: {
            $ifNull: ['$orderInfo.orderCustomer.email', 'NA'],
          },
          phone: {
            $ifNull: ['$orderInfo.orderCustomer.phone', 'NA'],
          },
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
      const sellerObjectId = sellerId ? new mongoose.Types.ObjectId(String(sellerId)).toString() : null;

      const orderSkuMap = new Map(
        (r.orderInfo?.orderSkuList?.skuList || []).map((sku) => [sku.merchantProductNo, sku])
      );

      //  Keep only seller's products
      const sellerProducts = (r.products || []).filter((p) => {
        if (!sellerObjectId) return true;

        const orderSku = orderSkuMap.get(p.productSkuCode);
        return orderSku && String(orderSku.sellerId) === sellerObjectId;
      });

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
        status: r.status || 'NA',
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
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}returns/merchant?apikey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(returnData),
    });

    const responseData = await response.json();

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
    const response = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}returns/merchant/acknowledge?apikey=${CHANNEL_ENGINE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(ackData),
      }
    );

    const responseData = await response.json();

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
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}returns?apikey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(returnData),
    });

    const responseData = await response.json();

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

    //  Only filter if sellerObjectId exists
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
                _id: 0,
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
    ]);

    if (!returnData) return null;

    const sellerShipments = await Shipment.find({
      _id: { $in: returnData?.shipmentId || [] },
      ...(sellerObjectId && { sellerId: sellerObjectId }),
      type: 'REVERSE',
      status: { $ne: 'CANCELED' },
    }).lean();

    const shippedSkuSet = new Set();

    sellerShipments.forEach((shipment) => {
      (shipment.products || []).forEach((p) => {
        if (p.merchantProductNo) {
          shippedSkuSet.add(p.merchantProductNo);
        }
      });
    });

    const returnSkus = (returnData.products || []).map((p) => p.productSkuCode) || [];

    const isAnySkuPending = returnSkus.some((sku) => !shippedSkuSet.has(sku));

    let finalStatus = returnData.status;

    if (isAnySkuPending) {
      finalStatus = 'IN_PROGRESS';
    }

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

    const returnLogsData = returnData?.logs?.length ? formatReturnTrackingInf(returnData.logs) : [];
    const aggregatedResult = {
      ...returnData,
      status: finalStatus,
      orderInfo,
      returnLogsData,
      omniful: returnData.omniful || null,
    };

    return formatReturnDetails(aggregatedResult);
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
    } = filters;

    const queryObj = { sellerId, status, platform, search, dateFrom, dateTo, sortBy, sortOrder, size, page };

    const basicResult = await (typeof getReturnsFromDatabase === 'function'
      ? getReturnsFromDatabase(queryObj)
      : Promise.resolve({ data: [] }));

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

    const pickupModelFields = Array.isArray(generateDynamicHeaders(PickupAddress))
      ? generateDynamicHeaders(PickupAddress).filter((h) => h !== '_id')
      : [];

    const deliveryModelFields = Array.isArray(generateDynamicHeaders(DeliveryAddress))
      ? generateDynamicHeaders(DeliveryAddress).filter((h) => h !== '_id')
      : [];
    // When no return IDs found → show message
    if (!returnIds.length) {
      return {
        success: false,
        message: 'No return records found to export.',
        data: [],
      };
    }

    const pipeline = typeof buildReturnAggregationPipeline === 'function' ? buildReturnAggregationPipeline() : [];
    pipeline.push({ $match: { _id: { $in: returnIds } } });

    // ---- shipment lookup (unchanged)
    pipeline.push({
      $lookup: {
        from: Shipment.collection?.collectionName || 'shipments',
        let: { orderIdFromOrderInfo: '$orderInfo._id', orderIdFromReturn: '$orderId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$status', 'CANCELED'] },
                  {
                    $or: [
                      { $eq: ['$orderId', '$$orderIdFromOrderInfo'] },
                      { $eq: ['$orderId', { $toString: '$$orderIdFromOrderInfo' }] },
                      { $eq: ['$orderId', '$$orderIdFromReturn'] },
                      { $eq: ['$_id', '$$orderIdFromReturn'] },
                    ],
                  },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'shipments',
      },
    });

    pipeline.push({ $addFields: { shipment: { $arrayElemAt: ['$shipments', 0] } } });

    pipeline.push({
      $addFields: {
        shipment: {
          $cond: [
            { $ifNull: ['$shipment', false] },
            { pickUpId: '$shipment.pickUpId', deliveryId: '$shipment.deliveryId' },
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
        let: { pickupId: '$shipment.pickUpId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$pickupId', null] },
                  {
                    $or: [{ $eq: ['$_id', '$$pickupId'] }, { $eq: [{ $toString: '$_id' }, '$$pickupId'] }],
                  },
                ],
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
        let: { deliveryId: '$shipment.deliveryId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$deliveryId', null] },
                  {
                    $or: [{ $eq: ['$_id', '$$deliveryId'] }, { $eq: [{ $toString: '$_id' }, '$$deliveryId'] }],
                  },
                ],
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

    const detailedValidation = validateExportData(aggregated, 'detailed return data');
    if (!detailedValidation.success) return detailedValidation;

    //  remove sellerIds + add sellerId
    const returnHeadersRaw = generateDynamicHeaders(Return);

    const returnHeaders = returnHeadersRaw.filter(
      (h) => h !== 'sellerIds' && h !== 'products' && h !== 'logs' && h !== 'omniful' && h !== 'shipmentId'
    );
    // insert sellerId at 2nd position
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
      ...pickupModelFields.map((h) => `pickup_${h}`),
      ...deliveryModelFields.map((h) => `delivery_${h}`),
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

        let baseRow = generateDynamicRowData(tempDoc, Return, ['products', 'logs', 'omniful', 'shipmentId']);
        //  remove sellerIds column value
        const sellerIdsIndex = returnHeadersRaw.indexOf('sellerIds');
        if (sellerIdsIndex !== -1) baseRow.splice(sellerIdsIndex, 1);

        //  handle returnId display
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
          simpleFormat(product.price), // unit price
          simpleFormat(totalPrice), // total price
        ];
        const fullRowArray = [
          baseRow[0], // returnId
          String(sellerId), //  sellerId in 2nd position
          ...baseRow.slice(1), // rest of fields
          ...productRow,
          ...shipmentRow,
          ...pickupRow,
          ...deliveryRow,
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

    const filename =
      typeof generateCSVFilename === 'function'
        ? generateCSVFilename('returns')
        : `returns-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`;

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
