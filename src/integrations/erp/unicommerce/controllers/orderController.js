import {
  errorResponse,
  failResponse,
  successResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
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
