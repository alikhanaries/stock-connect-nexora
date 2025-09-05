import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';
import mongoose from 'mongoose';

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

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Responses.failResponse(res, 'Invalid order ID format', 400);
    }
    const order = await orderService.getOrderById(id);
    if (!order) {
      return Responses.failResponse(res, 'Order not found', 404);
    }
    return Responses.successResponse(res, 'Order fetched successfully', 200, order);
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};

export const getSyncedOrders = async (req, res) => {
  try {
    const { success, data } = await orderService.getNewOrders();

    if (!success) {
      return Responses.errorResponse(res, 'No new orders found', 200);
    }

    if (data.length === 0) {
      return Responses.successResponse(res, 'already upto date', 200, []);
    }
    const dataSavedInDb = await orderService.processOrders(data);

    if (!dataSavedInDb.success) {
      return Responses.errorResponse(res, dataSavedInDb.message, 500);
    }
    const message =
      dataSavedInDb.data.upsertedCount.length > 0
        ? `${dataSavedInDb.data.upsertedCount.length} new order(s) were synced successfully.`
        : 'No new orders found. Displaying existing data.';
    const response = await orderService.getAllOrders(req.query);

    return Responses.successResponse(res, message, 200, response);
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};
