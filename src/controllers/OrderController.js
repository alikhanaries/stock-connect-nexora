import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';

export const getAllOrders = async (req, res) => {
  try {
    const result = await orderService.getAllOrders(req);
    if (!result.success) {
      return Responses.failResponse(res, 'Orders not found', 404);
    }
    return Responses.successResponse(res, 'Orders fetched successfully', 200, result);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};
