import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';

export const getAllOrders = async (req, res) => {
  try {
    const result = await orderService.getAllOrders(req.query);

    if (!result.success) {
      return Responses.failResponse(res, 'No orders found', 404);
    }

    return Responses.successResponse(res, 'Orders fetched successfully', 200, result);
  } catch (error) {
    console.error('Controller Error:', error.message);
    return Responses.errorResponse(res, error.message, 500);
  }
};
