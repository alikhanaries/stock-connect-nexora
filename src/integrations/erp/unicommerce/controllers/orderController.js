import {
  errorResponse,
  failResponse,
  successResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
import dispatchService from '../services/dispatchService.js';
import orderService from '../services/orderService.js';

export const getOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const { pageNumber = 1, pageSize = 50, orderDateFrom, orderDateTo, orderStatus } = req.query;
    const data = await orderService.fetchOrders(sellerId, {
      pageNumber,
      pageSize,
      orderDateFrom,
      orderDateTo,
      orderStatus,
    });

    return successResponse(res, 200, data);
  } catch (err) {
    console.error('unicommerce getOrders error:', err);
    return errorResponse(res, 500, { message: err.message });
  }
};

export const getOrderStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const { pageNumber = 1, pageSize = 5, orderIds } = req.query;
    const data = await orderService.fetchOrderStatus(sellerId, pageNumber, pageSize, orderIds);

    return successResponse(res, 200, data);
  } catch (error) {
    console.error('getOrderStatus error:', error);
    return errorResponse(res, 500, { message: 'Internal server error' });
  }
};

export const orderDispatch = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const userId = req.user?._id;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    if (!userId) {
      return failResponse(res, 400, { message: 'userId is missing' });
    }
    const result = await dispatchService.orderDispatch(sellerId, userId, req.body);
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('orderDispatch error:', error.message, error.stack);
    return errorResponse(res, 500, { message: error.message });
  }
};
