import Order from '#root/src/models/Orders.js';
import mapOrderToUniware from '../helpers/mapOrderToUniware.js';
import { normalizeUniwareDate } from '../utils/normalizeUniwareDate.js';

export const fetchOrders = async (sellerId, query = {}) => {
  try {
    const { pageNumber = 1, pageSize = 50, orderDateFrom, orderDateTo, orderStatus } = query;
    const page = Math.max(parseInt(pageNumber) || 1, 1);
    const limit = parseInt(pageSize) || 50;
    const skip = (page - 1) * limit;

    const filter = {
      sellerId,
    };

    // status filter
    if (orderStatus) {
      filter.status = orderStatus;
    }

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
};
