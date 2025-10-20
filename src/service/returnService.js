import { config } from '#config/config.js';
import Return from '#models/Return.js';
import {
  sanitizeReturnData,
  isNameOrEmailSearch,
  buildReturnAggregationPipeline,
  formatReturnDetails,
} from '#helpers/ReturnHandler.js';
import { getPagination } from '#helpers/PaginationHandler.js';

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
    if (!Content.length) return { success: true, data: responseData };

    // Save returns in batches to reduce memory usage
    const batchSize = 50;
    for (let i = 0; i < Content.length; i += batchSize) {
      const chunk = Content.slice(i, i + batchSize);
      await Promise.allSettled(chunk.map(saveReturnToDatabase));
    }

    return { success: true, data: responseData };
  } catch (error) {
    return { success: false, message: 'Error communicating with ChannelEngine.', error: error.message };
  }
};

//Saves return data to the database with simplified structure.
export const saveReturnToDatabase = async (returnData) => {
  try {
    // Sanitize return data using helper
    const sanitizationResult = sanitizeReturnData(returnData);
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
      channelId,
      returnId,
      orderID,
      search,
      dateFrom,
      dateTo,
      sortOrder = 'asc',
      sortBy = 'returnId',
    } = query;

    const page = parseInt(query.page, 10) || 1;
    const size = parseInt(query.size, 10) || 10;

    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    // Use the shared pipeline builder
    const pipeline = buildReturnAggregationPipeline();

    const matchConditions = {};

    if (status) {
      matchConditions.status = { $regex: new RegExp(`^${status}$`, 'i') };
      appliedFilters.status = status;
    }

    if (channelId) {
      const channelIdNum = parseInt(channelId, 10);
      matchConditions.channelId = channelIdNum;
      appliedFilters.channelId = channelIdNum;
    }

    if (returnId) {
      matchConditions.returnId = returnId;
      appliedFilters.returnId = returnId;
    }

    // OrderID filter
    if (orderID) {
      matchConditions['orderInfo.orderId'] = orderID;
      appliedFilters.orderID = orderID;
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [];

      // Search by returnId
      searchConditions.push({ returnId: { $regex: searchRegex } });

      // Search by orderID
      searchConditions.push({ 'orderInfo.orderId': { $regex: searchRegex } });

      // Search by customer name and email
      searchConditions.push({ 'orderInfo.orderCustomer.firstName': { $regex: searchRegex } });
      searchConditions.push({ 'orderInfo.orderCustomer.lastName': { $regex: searchRegex } });
      searchConditions.push({ 'orderInfo.orderCustomer.email': { $regex: searchRegex } });

      // Handle full name search
      const searchTerms = search.trim().split(/\s+/);
      if (searchTerms.length > 1) {
        const [firstTerm, ...restTerms] = searchTerms;
        const lastTerm = restTerms.join(' ');

        searchConditions.push({
          $and: [
            { 'orderInfo.orderCustomer.firstName': { $regex: new RegExp(firstTerm, 'i') } },
            { 'orderInfo.orderCustomer.lastName': { $regex: new RegExp(lastTerm, 'i') } },
          ],
        });
        searchConditions.push({
          $and: [
            { 'orderInfo.orderCustomer.lastName': { $regex: new RegExp(firstTerm, 'i') } },
            { 'orderInfo.orderCustomer.firstName': { $regex: new RegExp(lastTerm, 'i') } },
          ],
        });
      }

      matchConditions.$or = searchConditions;
      appliedFilters.search = search;
    }

    // Date filter
    if (dateFrom || dateTo) {
      matchConditions.createdAt = {};

      if (dateFrom) {
        matchConditions.createdAt.$gte = new Date(dateFrom);
        appliedFilters.dateFrom = dateFrom;
      }
      if (dateTo) {
        matchConditions.createdAt.$lte = new Date(dateTo);
        appliedFilters.dateTo = dateTo;
      }
    }

    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({ $match: matchConditions });
    }

    // Add formatting for list view
    pipeline.push({
      $addFields: {
        orderID: '$orderInfo.orderId',
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
    });

    pipeline.push({
      $addFields: {
        customer: {
          $cond: {
            if: { $eq: [{ $trim: { input: '$customer' } }, ''] },
            then: null,
            else: { $trim: { input: '$customer' } },
          },
        },
        quantity: '$totalQuantity',
        totalPrice: { $ifNull: ['$orderTotalPrice', '$totalPrice'] },
      },
    });

    if (search && isNameOrEmailSearch(search)) {
      pipeline.push({
        $match: {
          $or: [{ customer: { $ne: null } }, { email: { $ne: null } }, { orderID: { $ne: null } }],
        },
      });
    }

    // Create a separate pipeline for counting
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: 'total' });

    pipeline.push({ $sort: { [sortBy]: sortDirection } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: size });

    const [results, countResult] = await Promise.all([Return.aggregate(pipeline), Return.aggregate(countPipeline)]);

    const totalReturns = countResult.length > 0 ? countResult[0].total : 0;

    const formattedReturns = results.map((returnItem) => ({
      _id: returnItem._id,
      orderID: returnItem.orderID || null,
      quantity: returnItem.quantity || 0,
      totalPrice: returnItem.totalPrice || null,
      customer: returnItem.customer || null,
      placedOn: returnItem.placedOn,
      email: returnItem.email || null,
      phoneNumber: returnItem.phoneNumber || null,
      status: returnItem.status,
      platform: returnItem.platform,
    }));

    return {
      success: formattedReturns.length > 0,
      data: formattedReturns,
      pagination: getPagination(totalReturns, page, size),
      appliedFilters,
    };
  } catch (err) {
    console.error('Error fetching returns:', err.message);
    return { success: false, message: err.message };
  }
};

// Gets return statistics grouped by status.
export const getReturnStats = async () => {
  try {
    const statsAggregation = await Return.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const stats = statsAggregation.reduce((acc, stat) => {
      const status = stat._id || 'Unknown';
      acc[status] = stat.count;
      return acc;
    }, {});
    statsAggregation.forEach((stat) => {
      const status = stat._id || 'Unknown';
      stats[status] = stat.count;
    });

    return stats;
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
    const returnExists = await Return.findById(id).lean();
    if (!returnExists) {
      return null;
    }

    const pipeline = buildReturnAggregationPipeline();

    pipeline.push({
      $match: { _id: returnExists._id },
    });

    const [aggregatedResult] = await Return.aggregate(pipeline);

    if (!aggregatedResult) {
      return null;
    }

    return formatReturnDetails(aggregatedResult);
  } catch (error) {
    console.error('Error fetching return by ID:', error.message);
    throw error;
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
};
