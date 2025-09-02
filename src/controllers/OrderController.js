import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';

export const getAllOrders = async (req, res) => {
  try {
    const { data, appliedFilters, pagination } = await orderService.getAllOrders(req.query);

    if (!data.length) {
      return Responses.failResponse(res, 'No Orders found', 404, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return Responses.successResponse(res, 'Orders fetched successfully', 200, {
      content: data,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });

    // return Responses.successResponse(res, 'Orders fetched successfully', 200, result);
  } catch (error) {
    console.error('Controller Error:', error.message);
    return Responses.errorResponse(res, error.message, 500);
  }
};
