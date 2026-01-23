import Responses from '#helpers/response.js';
import dashboardService from '#service/dashboardService.js';
import { errorLog } from '#middleware/index.js';

export const getOrderFlow = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period } = req.query;

    const stats = await dashboardService.getOrderFlowStatus(sellerId, period);

    if (!stats) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_ORDER_STATUS, 404);
    }

    return Responses.successResponse(res, req.locale.ORDER_STATUS_STATS_FETCHED_SUCCESSFULLY, 200, stats);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getorderOverview = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period } = req.query;

    const status = await dashboardService.getorderOverviewStatus(sellerId, period);
    if (!status) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_ORDER_STATUS, 404);
    }

    return Responses.successResponse(res, req.locale.ORDER_STATUS_STATS_FETCHED_SUCCESSFULLY, 200, status);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getShipmentAnalytics = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period } = req.query;

    const data = await dashboardService.getShipmentAnalytics(sellerId, period);
    if (!data) {
      return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    }

    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period, metric } = req.query;

    const data = await dashboardService.getAnalyticsTimeSeries(sellerId, period, metric);
    if (!data) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_ORDER_STATUS, 404);
    }
    return Responses.successResponse(res, req.locale.ORDER_STATUS_STATS_FETCHED_SUCCESSFULLY, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getInventoryStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { period } = req.query;

    const data = await dashboardService.getInventoryStatus(sellerId, period);
    if (!data) {
      return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
