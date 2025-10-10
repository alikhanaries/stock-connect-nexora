import { config } from '#config/config.js';
import Return from '#models/Return.js';
import { sanitizeReturnData, isNameOrEmailSearch } from '#helpers/ReturnHandler.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

//Formats return data with order information
const formatReturnWithOrderData = async (returns) => {
  if (!returns || returns.length === 0) {
    return [];
  }

  // Get unique merchant order numbers from returns
  const merchantOrderNos = [...new Set(returns.map((returnItem) => returnItem.merchantOrderNo).filter(Boolean))];

  if (merchantOrderNos.length === 0) {
    // No merchant order numbers found, return returns with empty order data
    return returns.map((returnItem) => {
      const totalQuantity = returnItem.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0;

      return {
        _id: returnItem._id,
        orderID: null,
        quantity: totalQuantity,
        totalPrice: returnItem.totalPrice || null,
        customer: null,
        placedOn: returnItem.placedOn,
        email: null,
        phoneNumber: null,
        status: returnItem.status,
        platform: returnItem.platform,
      };
    });
  }

  // Find orders that match merchantOrderNo from returns
  const orders = await Order.find(
    { merchantOrderNo: { $in: merchantOrderNos } },
    {
      orderId: 1,
      merchantOrderNo: 1,
      totalInclVat: 1,
      orderCustomer: 1, // Get the full orderCustomer object
    }
  ).lean();

  // Create a map: merchantOrderNo -> Order data
  const orderMap = {};
  orders.forEach((order) => {
    orderMap[order.merchantOrderNo] = order;
  });

  // Format returns with matched order data
  return returns.map((returnItem) => {
    const orderData = orderMap[returnItem.merchantOrderNo] || {};

    const customerName = orderData.orderCustomer
      ? `${orderData.orderCustomer.firstName || ''} ${orderData.orderCustomer.lastName || ''}`.trim()
      : '';

    // Calculate total quantity from products
    const totalQuantity = returnItem.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0;

    return {
      _id: returnItem._id,
      orderID: orderData.orderId || null,
      quantity: totalQuantity,
      totalPrice: orderData.totalInclVat || null,
      customer: customerName || null,
      placedOn: returnItem.placedOn,
      email: orderData.orderCustomer?.email || null,
      phoneNumber: orderData.orderCustomer?.phone || null,
      status: returnItem.status,
      platform: returnItem.platform,
    };
  });
};

/**
 * Fetches returns from ChannelEngine and saves them to the database.
 */
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

/**
 * Saves return data to the database with simplified structure.
 */
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

    const pipeline = [];

    pipeline.push({
      $lookup: {
        from: 'channelengineorders',
        localField: 'merchantOrderNo',
        foreignField: 'merchantOrderNo',
        as: 'orderData',
      },
    });

    pipeline.push({
      $addFields: {
        orderInfo: { $arrayElemAt: ['$orderData', 0] },
        totalQuantity: {
          $reduce: {
            input: '$products',
            initialValue: 0,
            in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
          },
        },
      },
    });

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

    pipeline.push({
      $project: {
        _id: 1,
        returnId: 1,
        merchantReturnNo: 1,
        merchantOrderNo: 1,
        channelOrderNo: 1,
        channelReturnNo: 1,
        channelId: 1,
        placedOn: 1,
        acknowledgeDate: 1,
        platform: 1,
        products: 1,
        status: 1,
        totalPrice: 1,
        totalQuantity: 1,
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

export default {
  getReturns,
  getReturnsFromDatabase,
  saveReturnToDatabase,
  createReturn,
};
