import { config } from '#config/config.js';
import Return from '#models/Return.js';
import Order from '#models/Orders.js';
import mongoose from 'mongoose';
import {
  sanitizeReturnData,
  getOrderDataByOrderLineIds,
  isNameOrEmailSearch,
  buildReturnAggregationPipeline,
  formatReturnDetails,
} from '#helpers/ReturnHandler.js';
import { formatDateTime, escapeCsv } from '#helpers/Common.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { RETURN_STATUS } from '#constants/common.js';

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
    // Sanitize return data using helper
    const sanitizationResult = await sanitizeReturnData(returnData, Order);
    if (!sanitizationResult.success) {
      return sanitizationResult;
    }

    const simplifiedReturnDocument = sanitizationResult.data;

    // Use upsert to create or update the document based on returnId
    await Return.findOneAndUpdate({ returnId: simplifiedReturnDocument.returnId }, simplifiedReturnDocument, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in saveReturnToDatabase:', error.message);
    return { success: false, message: 'Error saving return to database', error: error.message };
  }
};

//Gets returns from the database with pagination and filtering using aggregation.

export const getReturnsFromDatabase = async (query = {}) => {
  try {
    const {
      status,
      platform,
      channelId,
      returnId,
      orderID,
      sellerId,
      search,
      dateFrom,
      dateTo,
      sortOrder = 'asc',
      sortBy = 'returnId',
      page = 1,
      size = 10,
    } = query;

    const skip = (parseInt(page, 10) - 1) * parseInt(size, 10);
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};
    const matchConditions = {};

    // ====== Filters ======
    const addFilter = (key, value, transform = (v) => v, includeInApplied = false) => {
      if (value !== undefined && value !== null && value !== '') {
        matchConditions[key] = transform(value);
        if (includeInApplied) {
          appliedFilters[key] = value;
        }
      }
    };

    // Validate status if provided
    if (status && !Object.values(RETURN_STATUS).includes(status.toUpperCase())) {
      throw new Error(`Invalid status: ${status}. Valid statuses are: ${Object.values(RETURN_STATUS).join(', ')}`);
    }

    addFilter('status', status, (v) => ({ $regex: new RegExp(`^${v}$`, 'i') }), true);
    addFilter('platform', platform, (v) => ({ $regex: new RegExp(v, 'i') }), true);
    addFilter('channelId', channelId, (v) => parseInt(v, 10));
    addFilter('returnId', returnId);
    addFilter('orderId', orderID);
    addFilter('orderInfo.sellerId', sellerId, (v) => new mongoose.Types.ObjectId(v));

    // ====== Search Filter ======
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { returnId: { $regex: searchRegex } },
        { orderId: { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.firstName': { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.lastName': { $regex: searchRegex } },
        { 'orderInfo.orderCustomer.email': { $regex: searchRegex } },
      ];

      // Handle full name searches
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

      matchConditions.$or = searchConditions;
    }

    // ====== Date Range Filter ======
    if (dateFrom || dateTo) {
      matchConditions.createdAt = {};
      if (dateFrom) matchConditions.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchConditions.createdAt.$lte = new Date(dateTo);
    }

    // ====== Build Aggregation Pipeline ======
    const pipeline = buildReturnAggregationPipeline();

    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({ $match: matchConditions });
    }

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

    if (search && isNameOrEmailSearch(search)) {
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
    if (sortBy === 'orderID') {
      actualSortBy = 'orderID'; // This field is created in $addFields above
    }

    pipeline.push({ $sort: { [actualSortBy]: sortDirection } }, { $skip: skip }, { $limit: parseInt(size, 10) });

    const [results, countResult] = await Promise.all([Return.aggregate(pipeline), Return.aggregate(countPipeline)]);

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

export const getReturnStats = async (sellerId = null) => {
  try {
    // Build base pipeline without status manipulation
    const basePipeline = buildReturnAggregationPipeline();

    if (sellerId) {
      basePipeline.push({
        $match: {
          'orderInfo.sellerId': sellerId,
        },
      });
    }

    // Get total quantity grouped by return status (raw status from DB)
    const statusPipeline = [
      ...basePipeline,
      { $unwind: '$products' },
      { $group: { _id: '$status', totalQuantity: { $sum: '$products.quantity' } } },
      { $sort: { _id: 1 } },
    ];

    const statusStats = await Return.aggregate(statusPipeline);

    // Initialize stats with all return statuses set to 0
    const stats = Object.values(RETURN_STATUS).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});

    // Update stats with actual counts from database
    statusStats.forEach(({ _id, totalQuantity }) => {
      if (_id && Object.values(RETURN_STATUS).includes(_id)) {
        stats[_id] = totalQuantity;
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
    const returnData = await Return.findById(id).lean();
    if (!returnData) {
      return null;
    }

    // Extract orderLineIds from products
    const orderLineIds = returnData.products?.map((p) => p.orderLineId).filter(Boolean) || [];

    let orderInfo = null;

    // Get order data
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
      });
    }

    // Create aggregated result format for formatReturnDetails
    const aggregatedResult = {
      ...returnData,
      totalQuantity: returnData.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0,
      orderInfo: orderInfo,
    };

    return formatReturnDetails(aggregatedResult);
  } catch (error) {
    console.error('Error fetching return by ID:', error.message);
    throw error;
  }
};

export const exportReturnsToCSV = async (sellerId = null, filters = {}) => {
  try {
    const query = { ...filters, sellerId, size: 1000, page: 1, sortBy: 'createdAt', sortOrder: 'desc' };
    const basicResult = await getReturnsFromDatabase(query);

    if (!basicResult.success || !basicResult.data?.length) {
      return { success: false, message: 'No returns found for export' };
    }

    const returnIds = basicResult.data.map((item) => new mongoose.Types.ObjectId(item._id));
    const pipeline = buildReturnAggregationPipeline();

    pipeline.push(
      { $match: { _id: { $in: returnIds } } },
      {
        $addFields: {
          customerName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ['$orderInfo.orderCustomer.firstName', ''] },
                  ' ',
                  { $ifNull: ['$orderInfo.orderCustomer.lastName', ''] },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          returnId: 1,
          orderId: 1,
          platform: 1,
          status: 1,
          placedOn: 1,
          createdAt: 1,
          products: 1,
          customerName: 1,
          'orderInfo.orderId': 1,
          'orderInfo.orderCustomer.email': 1,
          'orderInfo.orderCustomer.phone': 1,
          'orderInfo.orderShippingAddress': 1,
          'orderInfo.orderSkuList.skuList': 1,
        },
      }
    );

    const detailedResults = await Return.aggregate(pipeline);
    if (!detailedResults?.length) return { success: false, message: 'No detailed return data found for export' };

    const headers = [
      'Return ID',
      'Order ID',
      'Platform',
      'Status',
      'Placed On',
      'Returned At',
      'Product SKU',
      'Product Name',
      'Product ID',
      'Quantity',
      'Accepted Quantity',
      'Rejected Quantity',
      'Unit Price',
      'Total Price',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Shipping Address Line 1',
      'Shipping Address Line 2',
      'Shipping City',
      'Shipping State',
      'Shipping Postal Code',
      'Shipping Country',
    ];
    const csvRows = [headers.join(',')];

    detailedResults.forEach((item) => {
      const { returnId, orderId, platform, status, placedOn, createdAt, products, orderInfo, customerName } = item;
      const customer = orderInfo?.orderCustomer || {};
      const shipping = orderInfo?.orderShippingAddress || {};
      const orderSkus = orderInfo?.orderSkuList?.skuList || [];

      const baseRow = [
        returnId || '',
        orderId || orderInfo?.orderId || '',
        platform || '',
        status || '',
        formatDateTime(placedOn)?.date || '',
        formatDateTime(createdAt)?.date || '',
      ];

      const addressRow = [
        customerName?.trim() || '',
        customer.email || '',
        customer.phone || '',
        shipping.line1 || '',
        shipping.line2 || '',
        shipping.city || '',
        shipping.region || '',
        shipping.zipCode || '',
        shipping.countryIso || '',
      ];

      if (!products?.length) {
        csvRows.push(escapeCsv([...baseRow, '', '', '', 0, 0, 0, 0, 0, ...addressRow]));
      } else {
        products.forEach((product) => {
          const sku = orderSkus.find((s) => s.id === product.orderLineId);
          const unitPrice = sku?.unitPriceInclVat || 0;
          const quantity = product.quantity || 0;
          const productRow = [
            ...baseRow,
            product.productSkuCode || sku?.merchantProductNo || '',
            sku?.description || 'Product',
            product.orderLineId || '',
            quantity,
            product.acceptedQuantity || 0,
            product.rejectedQuantity || 0,
            unitPrice,
            unitPrice * quantity,
            ...addressRow,
          ];
          csvRows.push(escapeCsv(productRow));
        });
      }
    });

    return {
      success: true,
      data: csvRows.join('\n'),
      filename: `returns-export-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.csv`,
      count: detailedResults.length,
    };
  } catch (error) {
    console.error('Error exporting returns to CSV:', error.message);
    return { success: false, message: 'Error generating CSV export', error: error.message };
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
  exportReturnsToCSV,
};
