import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { ORDER_STATUS_MAP, SELECTED_FIELDS } from '#constants/common.js';
import orderhelper from '#helpers/Order.js';
import { config } from '#config/config.js';
import { randomBytes } from 'node:crypto';
const { CHANNEL_ORDER_URL, CHANNEL_ENGINE_BASE_URL } = config;

const formatOrder = (order) => {
  const totalQuantity = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.quantity || 0), 0) || 0;
  const totalPrice = order.orderSkuList.skuList?.reduce((sum, sku) => sum + (sku.lineVat || 0), 0) || 0;
  const customer = `${order.orderCustomer?.firstName || ''} ${order.orderCustomer?.lastName || ''}`.trim();

  return {
    _id: order._id,
    orderID: order.orderId,
    quantity: totalQuantity,
    totalPrice: totalPrice,
    customer,
    placedOn: order.orderDate,
    email: order.orderCustomer?.email,
    phoneNumber: order.orderCustomer?.phone,
    status: order.status,
    platform: order.channelName,
    paymentMethod: order.paymentDetails?.paymentMethod,
    currencyCode: order.paymentDetails?.currencyCode,
  };
};

const getAllOrders = async (query) => {
  try {
    const {
      page = 1,
      size = 10,
      search,
      toDate,
      fromDate,
      status,
      sortOrder = 'asc',
      sortBy = '_id',
      platform = '',
    } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    const filter = {};

    //search filter
    if (search) {
      const regex = { $regex: search, $options: 'i' };

      filter.$or = [
        { orderId: regex },
        { 'orderSkuList.skuList.description': regex },
        { 'orderCustomer.email': regex },
        { 'orderCustomer.firstName': regex },
        { 'orderCustomer.lastName': regex },
        { 'orderCustomer.phone': regex },
      ];
    }

    //platform filter
    if (platform) {
      filter.channelName = { $regex: platform, $options: 'i' };
      appliedFilters.platform = platform;
    }

    //date filter
    if (fromDate || toDate) {
      filter.createdAt = {};

      if (fromDate) {
        filter.createdAt.$gte = new Date(fromDate);
        appliedFilters.fromDate = fromDate;
      }
      if (toDate) {
        filter.createdAt.$lte = new Date(toDate);
        appliedFilters.toDate = toDate;
      }
    }

    // status filter
    if (status) {
      filter.status = { $regex: new RegExp(`^${status}$`, 'i') };
      appliedFilters.status = status;
    }

    const [totalOrders, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
        .select(SELECTED_FIELDS)
        .lean(),
    ]);

    return {
      data: orders.map(formatOrder),
      appliedFilters: appliedFilters,
      pagination: getPagination(totalOrders, page, size),
    };
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return { success: false, message: err.message };
  }
};

const getOrderById = async (id) => {
  const order = await Order.findById(id).lean();
  if (!order) {
    return false;
  }
  return order;
};

const getOrderStats = async () => {
  try {
    const statuses = Object.keys(ORDER_STATUS_MAP);
    const counts = await Promise.all(statuses.map((status) => Order.countDocuments({ status })));
    const stats = statuses.reduce((acc, status, i) => {
      acc[status] = counts[i];
      return acc;
    }, {});
    return stats;
  } catch (error) {
    console.error('Error getting order stats:', error.message);
  }
};

const processOrders = async (orders) => {
  try {
    const operations = orderhelper.sanitizeOrdersData(orders);
    const result = await Order.bulkWrite(operations);

    return { success: true, data: { ...result } };
  } catch (error) {
    console.error('Error :', error.message);
    return { success: false, message: error.message };
  }
};

export async function getNewOrders() {
  try {
    const response = await fetch(CHANNEL_ORDER_URL);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    if (!data?.Content?.length) {
      return { success: false, message: 'No data received from ChannelEngine' };
    }
    return {
      success: true,
      data: data.Content,
    };
  } catch (error) {
    console.error('Error fetching new orders from ChannelEngine:', error.message);
    return { success: false, message: error.message };
  }
}

const getOrderComparison = async (lowercasedPeriod) => {
  const { currentPeriodStart, previousPeriodStart, previousPeriodEnd } = orderhelper.getPeriodDate(lowercasedPeriod);

  const [currentCount, previousCount] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: currentPeriodStart } }),
    Order.countDocuments({ createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd } }),
  ]);

  let percentageChange = 0;
  if (previousCount > 0) {
    percentageChange = Math.round(((currentCount - previousCount) / previousCount) * 100);
  } else if (currentCount > 0) {
    percentageChange = 100;
  }
  const response = {
    totalOrders: currentCount - previousCount,
    percentage: percentageChange,
    period: lowercasedPeriod,
  };
  return response;
};

/**
 * Cancels an order in ChannelEngine and updates the local order status in the database.
 *
 * @param {string} orderId - The MongoDB ObjectId of the order to cancel.
 * @param {string} reason - The reason for cancellation (must be a meaningful string).
 * @param {string} reasonCode - The cancellation reason code (string, as required by ChannelEngine).
 *
 * What it does:
 * - Finds the order in the database by orderId.
 * - Checks the current status of the order. If the order is already cancelled (MANCO), closed (CLOSED), returned (RETURNED), or shipped (SHIPPED), it will not proceed and returns an error.
 * - Builds a cancellation payload for ChannelEngine, including all order lines.
 * - Makes a POST request to ChannelEngine's /cancellations endpoint with the payload and API key.
 * - Handles ChannelEngine's response and error codes.
 * - If cancellation is successful, updates the order status and all order line statuses to 'MANCO' in the database.
 *
 * Returns:
 * - On success: { success: true, data: <updated order document> }
 * - On failure: { success: false, error: <error object or message> }
 */
const cancelOrder = async (orderId, reason, reasonCode) => {
  try {
    const existenceOfOrder = await Order.findById(orderId);
    // console.log('service - Obtained Order Id');
    if (!existenceOfOrder) {
      return { success: false, error: { message: 'Order not found', status: 404 } };
    }
    // console.log('service - checking existence');
    let lines;
    lines = existenceOfOrder.orderSkuList.skuList.map((oItem) => {
      return {
        MerchantProductNo: oItem.merchantProductNo,
        OrderLineId: oItem.id,
        Quantity: oItem.quantity,
      };
    });

    // console.log('service - creating info');
    // Create Payload
    const info = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: existenceOfOrder.merchantOrderNo,
      Lines: lines,
      Reason: reason,
      ReasonCode: reasonCode,
      IsMerchantCreator: true,
    };
    console.log(info);

    // Status checking from Database
    console.log('service - checking status', existenceOfOrder.status);
    if (existenceOfOrder.status === 'MANCO') {
      return { success: false, error: { message: 'Order has already cancelled, please check!', status: 400 } };
    }
    if (existenceOfOrder.status === 'CLOSED') {
      return { success: false, error: { message: 'Order has already closed, please check!', status: 400 } };
    }
    if (existenceOfOrder.status === 'RETURNED') {
      return { success: false, error: { message: 'Order has returned, can not cancel while returning!', status: 400 } };
    }
    if (existenceOfOrder.status === 'SHIPPED') {
      return { success: false, error: { message: 'Order has shipped, can not cancel now!', status: 400 } };
    }

    // Cancellation call with api key and payload
    // console.log('service - making cancellation call');
    const markingCancelled = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}/cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`,
      {
        method: 'POST',
        body: JSON.stringify(info),
      }
    );

    // console.log('service - convert to json response of cancellation');
    const markingCancelledObject = await markingCancelled.json();
    // console.log(markingCancelledObject);

    if (parseInt(markingCancelledObject.StatusCode / 100) === 4) {
      return { success: false, error: markingCancelledObject };
    }

    // After successful cancellation update the database
    // console.log('Updating database:');
    const updateInformation = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          status: 'MANCO',
          'orderSkuList.skuList.$[].status': 'MANCO',
        },
      },
      { new: true }
    );
    // console.log('service - sending info and success true');

    return { success: true, data: updateInformation };
  } catch (error) {
    console.log(error);
    return { success: false, error: error };
  }
};

export default {
  getAllOrders,
  getOrderById,
  processOrders,
  getNewOrders,
  getOrderStats,
  getOrderComparison,
  cancelOrder,
};
