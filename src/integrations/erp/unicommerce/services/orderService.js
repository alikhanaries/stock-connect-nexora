import Order from '#root/src/models/Orders.js';
import { mapOrderStatus } from '../helpers/mapOrderStatus.js';
import { ObjectId } from 'mongodb';
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
export default {
  fetchOrderStatus,
};
