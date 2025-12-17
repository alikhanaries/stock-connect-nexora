import Responses from '#helpers/response.js';
import orderService from '#service/orderService.js';
import mongoose from 'mongoose';
import { errorLog } from '#middleware/index.js';
import { VALID_PERIODS } from '#constants/common.js';
import { cancelFullOrderOcp, getSyncedOrdersOcp } from '../integrations/erp/ocp/services/orderServices.js';
import Order from '../models/Orders.js';

export const getAllOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { data, appliedFilters, pagination } = await orderService.getAllOrders(req.query, sellerId);

    if (!data.length) {
      return Responses.successResponse(res, req.locale.NO_ORDERS_FOUND, 200, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return Responses.successResponse(res, req?.locale?.ORDERS_FETCHED_SUCCESSFULLY, 200, {
      content: data,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });
  } catch (error) {
    console.error('Controller Error:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }
    const order = await orderService.getOrderById(id);
    if (!order) {
      return Responses.failResponse(res, req.locale.NO_ORDERS_FOUND, 404);
    }
    return Responses.successResponse(
      res,
      req?.locale?.ORDER_FETCHED_SUCCESSFULLY || 'Order Fetched Successfully',
      200,
      order
    );
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getOrderStats = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const stats = await orderService.getOrderStats(sellerId);
    if (!stats) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_ORDER_STATUS, 404);
    }
    return Responses.successResponse(res, req.locale.ORDER_STATUS_STATS_FETCHED_SUCCESSFULLY, 200, stats);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getSyncedOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    // TODO : Move this to service layer
    const { success, data } = await orderService.getNewOrders();
    if (!success) {
      return Responses.errorResponse(res, req.locale.NO_ORDERS_FOUND, 200);
    }

    if (data.length === 0) {
      return Responses.successResponse(res, req.locale.ALREADY_UP_TO_DATE, 200, []);
    }

    const [dataSavedInDb, response] = await Promise.allSettled([
      orderService.processOrders(data),
      getSyncedOrdersOcp(sellerId),
    ]);

    if (!dataSavedInDb.value.success && !response.value.success) {
      return Responses.errorResponse(res, dataSavedInDb.value.message && response.value.message, 500);
    }

    const newUpdateCount =
      (dataSavedInDb?.value?.data?.upsertedCount ? dataSavedInDb?.value?.data?.upsertedCount : 0) +
      (response?.value?.data?.upsertedCount ? response?.value?.data?.upsertedCount : 0);

    const message =
      newUpdateCount > 0
        ? `${newUpdateCount} ${req.locale.NEW_ORDERS_SYNCED_SUCCESSFULLY}`
        : req.locale.NO_NEW_ORDERS_FOUND;

    const newOrdersToAcknowledge = data.filter((order) => order.Status === 'NEW');
    if (newOrdersToAcknowledge.length > 0) {
      orderService.backgroundAcknowledgementOrders(newOrdersToAcknowledge);
    }

    return Responses.successResponse(res, message, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getOrderComparison = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period = 'week' } = req.query;
    const lowercasedPeriod = period.toLowerCase();

    if (!VALID_PERIODS.includes(lowercasedPeriod)) {
      return Responses.failResponse(res, `${req.locale.INVALID_PERIOD} ${VALID_PERIODS.join(', ')}`, 400);
    }

    const response = await orderService.getOrderComparison(lowercasedPeriod, sellerId);
    if (!response) {
      return Responses.failResponse(res, req.locale.ORDER_COMPARISON_CALC_FAILED, 404);
    }

    return Responses.successResponse(
      res,
      `${response.period} ${req.locale.ORDER_COMPARISON_FETCHED_SUCCESSFULLY}`,
      200,
      response
    );
  } catch (error) {
    console.error('Controller Error:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const merchantCancelById = async (req, res) => {
  try {
    const { orderId, reason, specifics } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }

    if (!reason) {
      return Responses.failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    const orderResponse = await orderService.cancelOrder(orderId, reason, specifics);

    if (!orderResponse.success) {
      return Responses.failResponse(res, orderResponse.error.message, orderResponse.error.status, orderResponse.error);
    }

    return Responses.successResponse(res, req.locale.CANCEL_ORDER, 200, orderResponse);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const cancelFullOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return Responses.failResponse(res, req.locale.INVALID_ORDER_ID_FORMAT, 400);
    }

    if (!reason) {
      return Responses.failResponse(res, req.locale.INVALID_INPUT, 400);
    }

    const order = await Order.findById(orderId).lean();

    if (!order) return Responses.failResponse(res, 'Order not found', 404);

    let orderResponse;

    if (order.channelName === 'OCP') {
      orderResponse = await cancelFullOrderOcp(orderId, order, reason);
    } else {
      orderResponse = await orderService.cancelFullOrder(orderId, order, reason);
    }

    if (!orderResponse.success) {
      return Responses.failResponse(
        res,
        orderResponse?.error?.message || orderResponse?.message,
        orderResponse?.error?.status || orderResponse?.status,
        null
      );
    }

    return Responses.successResponse(res, req?.locale?.CANCEL_ORDER || 'Order is cancelled', 200, null);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
export const cancelPartialOrder = async (req, res) => {
  try {
    const { orderId, reason, products } = req.body;

    const orderResponse = await orderService.cancelPartialOrder(orderId, products, reason);
    if (!orderResponse.success) {
      return Responses.failResponse(res, orderResponse.error.message, orderResponse.error.status, null);
    }

    return Responses.successResponse(res, 'Order is cancelled', 200, null);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
