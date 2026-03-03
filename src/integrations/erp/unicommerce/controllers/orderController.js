import {
  errorResponse,
  failResponse,
  successResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
import orderService from '../services/orderService.js';

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
