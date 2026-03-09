import Order from '#root/src/models/Orders.js';
import { mapOrderStatus } from '../helpers/mapOrderStatus.js';
import { ObjectId } from 'mongodb';
import mapOrderToUniware from '../helpers/mapOrderToUniware.js';
import { normalizeUniwareDate } from '../utils/normalizeUniwareDate.js';

export const fetchOrderStatus = async (sellerId, pageNumber, pageSize, orderIds) => {
  try {
    const page = Math.max(Number(pageNumber) || 1, 1);
    const limit = Number(pageSize) || 5;
    const skip = (page - 1) * limit;
    const normalizedOrderId =
      typeof orderIds === 'string' ? orderIds.trim() : orderIds != null ? String(orderIds).trim() : null;
    const query = {
      sellerId: new ObjectId(sellerId),
    };
    if (normalizedOrderId) {
      query.orderId = normalizedOrderId;
    }

    const orders = await Order.find(query).skip(skip).limit(limit).lean();

    if (!orders.length) {
      return { orders: [] };
    }

    return {
      orders: orders.map(mapOrderStatus),
    };
  } catch (error) {
    console.error('fetchOrderStatus service error:', error);
    throw error;
  }
};

export const fetchOrders = async (sellerId, query = {}) => {
  try {
    const { pageNumber = 1, pageSize = 50, orderDateFrom, orderDateTo } = query;
    const page = Math.max(parseInt(pageNumber) || 1, 1);
    const limit = parseInt(pageSize) || 50;
    const skip = (page - 1) * limit;

    const filter = {
      sellerId,
      status: 'IN_PROGRESS',
    };

    // date range filter
    if (orderDateFrom || orderDateTo) {
      filter.orderDate = {};

      if (orderDateFrom) {
        filter.orderDate.$gte = normalizeUniwareDate(orderDateFrom);
      }

      if (orderDateTo) {
        filter.orderDate.$lte = normalizeUniwareDate(orderDateTo);
      }
    }
    const orders = await Order.find(filter).sort({ orderDate: 1 }).skip(skip).limit(limit).lean();

    //  map to Uniware format
    const formattedOrders = orders.map(mapOrderToUniware);

    return {
      orders: formattedOrders,
    };
  } catch (err) {
    console.error('fetchOrders service error:', err);
    throw err;
  }
};

export default {
  fetchOrders,
  fetchOrderStatus,
};
