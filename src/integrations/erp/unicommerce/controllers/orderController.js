import {
  errorResponse,
  failResponse,
  successResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
import dispatchService from '../services/dispatchService.js';
import orderService from '../services/orderService.js';

export const ordersController = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { orderIds, pageNumber, pageSize } = req.query;
    let result;
    if (orderIds) {
      result = await orderService.fetchOrderStatus(sellerId, pageNumber, pageSize, orderIds);
    } else {
      result = await orderService.fetchOrders(sellerId, req.query);
    }
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('ordersController error:', error);
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

export const cancelOrder = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const result = await orderService.cancelOrders(sellerId, req.body);
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('cancelOrders error:', error.message, error.stack);
    return errorResponse(res, 500, {
      message: error.message,
    });
  }
};
