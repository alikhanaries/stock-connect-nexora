import Order from '#models/Orders.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { ORDER_STATUS_MAP, SELECTED_FIELDS, BLOCKED_STATUSES } from '#constants/common.js';
import orderhelper from '#helpers/Order.js';
import { config } from '#config/config.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;
import { randomBytes } from 'node:crypto';

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
      sortOrder = 'desc',
      sortBy = 'orderId',
      platform = '',
    } = query;
    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const appliedFilters = {};

    const filter = {};

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

    if (platform) {
      filter.channelName = { $regex: platform, $options: 'i' };
      appliedFilters.platform = platform;
    }

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
        .collation({ locale: 'en_US', numericOrdering: true })
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
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}orders?apiKey=${CHANNEL_ENGINE_API_KEY}`);
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

const cancelOrder = async (orderId, reason) => {
  try {
    const existenceOfOrder = await Order.findById(orderId).lean();
    if (!existenceOfOrder) {
      return { success: false, error: { message: 'Order not found', status: 404 } };
    }

    const lines = existenceOfOrder.orderSkuList.skuList.map((oItem) => {
      return {
        MerchantProductNo: oItem.merchantProductNo,
        OrderLineId: oItem.id,
        Quantity: oItem.quantity,
      };
    });

    const info = {
      MerchantCancellationNo: randomBytes(6).toString('hex'),
      MerchantOrderNo: existenceOfOrder.merchantOrderNo,
      Lines: lines,
      Reason: reason,
      ReasonCode: '0',
      IsMerchantCreator: true,
    };

    if (BLOCKED_STATUSES[existenceOfOrder.status]) {
      return { success: false, error: { message: BLOCKED_STATUSES[existenceOfOrder.status], status: 400 } };
    }

    const markingCancelled = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`,
      {
        method: 'POST',
        body: JSON.stringify(info),
      }
    );

    const markingCancelledObject = await markingCancelled.json();

    if (parseInt(markingCancelledObject.StatusCode / 100) === 4) {
      return { success: false, error: markingCancelledObject };
    }

    const updateInformation = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          status: ORDER_STATUS_MAP.MANCO,
          'orderSkuList.skuList.$[].status': ORDER_STATUS_MAP.MANCO,
        },
      },
      { new: true }
    );

    return { success: true, data: updateInformation.toObject() };
  } catch (error) {
    console.error(error);
    return { success: false, error: error };
  }
};

const acknowledgeOrder = async (orderId, merchantOrderNo) => {
  const url = `${CHANNEL_ENGINE_BASE_URL}orders/acknowledge?apiKey=${CHANNEL_ENGINE_API_KEY}`;

  const payload = {
    MerchantOrderNo: merchantOrderNo,
    OrderId: orderId,
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to acknowledge order: ${errorData.Message || response.statusText}`);
    }
  } catch (error) {
    console.error(`Failed to acknowledge order ${orderId}:`, error.message);
    throw new Error(`Failed to acknowledge order ${orderId}`);
  }
};
const backgroundAcknowledgementOrders = async (newOrdersToAcknowledge) => {
  if (newOrdersToAcknowledge.length > 0) {
    const ackPromises = newOrdersToAcknowledge.map((order) => {
      const merchantOrderNo = `${order.ChannelOrderNo}-${order.Id}`;
      return acknowledgeOrder(order.Id, merchantOrderNo);
    });

    await Promise.allSettled(ackPromises);
    console.log(`SYNC: Acknowledging ${ackPromises.length} new orders...`);
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
  acknowledgeOrder,
  backgroundAcknowledgementOrders,
};
