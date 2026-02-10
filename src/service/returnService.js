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
  isNameOrEmailSearch,
  buildReturnAggregationPipeline,
  buildReturnMatchAndPipeline,
  formatReturnDetails,
} from '#helpers/ReturnHandler.js';
import {
  escapeCsv,
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
    const params = new URLSearchParams({
      ...queryParams,
      apikey: `${CHANNEL_ENGINE_API_KEY}`,
    });

    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}returns?${params.toString()}`);
    const responseData = await response.json();

    if (!response.ok) {
      return { success: false, message: `ChannelEngine API error: ${response.status}`, error: responseData };
    }

    const { Content = [] } = responseData;
    if (!Content.length) return { success: true, data: { Content: [], upsertedCount: 0, totalProcessed: 0 } };

    // Save returns using bulk operations to track new vs existing
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

    let upsertedCount = 0;
    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await Return.bulkWrite(bulkOps);
      upsertedCount = result.upsertedCount || 0;
      modifiedCount = result.modifiedCount || 0;
    }

    return {
      success: true,
      data: {
        ...responseData,
        upsertedCount,
        modifiedCount,
        totalProcessed: Content.length,
      },
    };
  } catch (error) {
    return { success: false, message: 'Error communicating with ChannelEngine.', error: error.message };
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

export const getReturnsFromDatabase = async (query = {}) => {
  try {
    const { status, sortOrder = 'asc', sortBy = 'placedOn', page = 1, size = 10, channelId, platform } = query;

    const skip = (parseInt(page, 10) - 1) * parseInt(size, 10);
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};
    // Validate status if provided
    if (status) {
      const statusArray = status
        .toString()
        .split(',')
        .map((s) => s.trim().toUpperCase());

      // Check each provided status
      const invalid = statusArray.filter((s) => !Object.values(RETURN_STATUS).includes(s));

      if (invalid.length > 0) {
        throw new Error(
          `Invalid status: ${invalid.join(', ')}. Valid statuses are: ${Object.values(RETURN_STATUS).join(', ')}`
        );
      }

      appliedFilters.status = status;
    }

    // Add other filters to appliedFilters
    if (channelId) appliedFilters.channelId = channelId;
    if (platform) appliedFilters.platform = platform;

    const { pipeline } = buildReturnMatchAndPipeline(query, {
      includeSearchNameSplit: true,
    });

    pipeline.push(
      {
        $addFields: {
          orderID: { $ifNull: ['$orderId', '$orderInfo.orderId'] },
          customer: {
            $concat: [
              { $ifNull: ['$orderInfo.orderCustomer.firstName', ''] },
              ' ',
              { $ifNull: ['$orderInfo.orderCustomer.lastName', ''] },
            ],
          },
          email: '$orderInfo.orderCustomer.email',
          phoneNumber: '$orderInfo.orderCustomer.phone',
          orderTotalPrice: '$orderInfo.totalInclVat',
          placedOn: { $ifNull: ['$placedOn', '$createdAt'] },
        },
      },
      {
        $addFields: {
          customer: {
            $cond: [{ $eq: [{ $trim: { input: '$customer' } }, ''] }, null, { $trim: { input: '$customer' } }],
          },
          quantity: '$totalQuantity',
          totalPrice: { $ifNull: ['$orderTotalPrice', '$totalPrice'] },
        },
      }
    );

    if (query.search && isNameOrEmailSearch(query.search)) {
      pipeline.push({
        $match: {
          $or: [{ customer: { $ne: null } }, { email: { $ne: null } }, { orderID: { $ne: null } }],
        },
      });
    }

    // ====== Count and Paginate ======
    const countPipeline = [...pipeline, { $count: 'total' }];

    // Handle sorting - map orderID to the actual field name
    let actualSortBy = sortBy;
    if (sortBy === 'placedOn') {
      actualSortBy = 'placedOn';
    }

    if (sortBy === 'returnId') {
      pipeline.push({
        $addFields: {
          returnIdNumeric: { $toInt: '$returnId' },
        },
      });
      actualSortBy = 'returnIdNumeric';
    }

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

    const formattedReturns = results.map((r) => ({
      _id: r._id,
      orderID: r.orderID || null,
      quantity: r.quantity || 0,
      totalPrice: r.totalPrice || null,
      customer: r.customer || null,
      placedOn: r.placedOn,
      email: r.email || null,
      phoneNumber: r.phoneNumber || null,
      status: r.status,
      platform: r.platform,
      returnId: r.returnId,
      channelImage: channelMap[results[0].channelId],
    }));

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

export const getReturnById = async (id) => {
  try {
    const returnDataCheck = await Return.findById(id).lean();
    if (!returnDataCheck) {
      return null;
    }

    // --- Step 1: Sync shipment status before fetching ---
    await syncReturnShipmentStatus(id);

    // --- Step 2: Aggregate Return + Latest Shipment ---
    const [returnData] = await Return.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'shipments',
          let: { shipment_ids: '$shipmentId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $in: ['$_id', { $ifNull: ['$$shipment_ids', []] }] }],
                },
              },
            },
            { $sort: { createdAt: -1 } }, // get the latest
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

    // Extract orderLineIds from products
    const orderLineIds = returnData.products?.map((p) => p.orderLineId).filter(Boolean) || [];

    let orderInfo = null;

    // --- Step 4: Fetch order data if applicable ---
    if (orderLineIds.length > 0) {
      orderInfo = await getOrderDataByOrderLineIds(orderLineIds, Order, {
        orderId: 1,
        totalInclVat: 1,
        subTotalExclVat: 1,
        subTotalVat: 1,
        shippingCostsExclVat: 1,
        shippingCostsVat: 1,
        channelName: 1,
        orderCustomer: 1,
        orderShippingAddress: 1,
        orderPaymentDetails: 1,
        'orderSkuList.skuList': 1,
        _id: 1,
      });
    }

    // Format the log details safely
    const returnLogsData = returnData?.logs?.length ? formatReturnTrackingInf(returnData.logs) : [];
    const aggregatedResult = {
      ...returnData,
      totalQuantity: returnData.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0,
      orderInfo,
      returnLogsData,
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

    const returnHeaders = generateDynamicHeaders(Return);
    const shipmentSingleHeader = ['pickUpId', 'deliveryId'];
    const pickupPrefixedHeaders = pickupModelFields.map((h) => `pickup_${h}`);
    const deliveryPrefixedHeaders = deliveryModelFields.map((h) => `delivery_${h}`);
    const csvHeaders = [
      ...returnHeaders,
      ...shipmentSingleHeader,
      ...pickupPrefixedHeaders,
      ...deliveryPrefixedHeaders,
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
          if (cur == null) {
            cur = null;
            break;
          }
          cur = cur[p];
        }
        return simpleFormat(cur);
      });
    };

    const csvRows = [csvHeaders.join(',')];

    for (const doc of aggregated) {
      const baseRow = generateDynamicRowData(doc, Return);

      const pickUpIdValue = doc?.shipment?.pickUpId ? String(doc.shipment.pickUpId) : '';
      const deliveryIdValue = doc?.shipment?.deliveryId ? String(doc.shipment.deliveryId) : '';
      const shipmentRow = [simpleFormat(pickUpIdValue), simpleFormat(deliveryIdValue)];

      const pickupDoc = doc?.shipment?.pickupAddress ?? null;
      const deliveryDoc = doc?.shipment?.deliveryAddress ?? null;

      const pickupRow = mapModelFields(pickupDoc, pickupModelFields);
      const deliveryRow = mapModelFields(deliveryDoc, deliveryModelFields);

      const fullRowArray = [...baseRow, ...shipmentRow, ...pickupRow, ...deliveryRow];

      const csvLine =
        typeof escapeCsv === 'function'
          ? escapeCsv(fullRowArray)
          : fullRowArray
              .map((v) => {
                const s = simpleFormat(v);
                if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
                return s;
              })
              .join(',');

      csvRows.push(csvLine);
    }

    const filename =
      typeof generateCSVFilename === 'function' ? generateCSVFilename('returns') : `returns-${Date.now()}.csv`;
    return createCSVExportResponse(csvRows, filename, aggregated.length);
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
