import Responses from '#helpers/response.js';
import dashboardService from '#service/dashboardService.js';
import { errorLog } from '#middleware/index.js';

export const getOrderFlow = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const stats = await dashboardService.getOrderFlowStatus(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

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
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const status = await dashboardService.getorderOverviewStatus(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });
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
    const sellerIds = req.sellerIds ?? req.sellerId;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getShipmentAnalytics(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

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
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getAnalyticsTimeSeries(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });
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
    const sellerIds = req.sellerIds ?? req.sellerId;
    const { period, startDate, endDate, month, channel, type } = req.query;

    const data = await dashboardService.getInventoryStatus(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
      type,
    });

    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getChannelStatus = async (req, res) => {
  try {
    const sellerIds = req.sellerIds ?? req.sellerId;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getChannelStatus(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getTopPerformersProducts = async (req, res) => {
  try {
    const sellerIds = req.sellerIds ?? req.sellerId;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getTopPerformersProducts(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

    if (!data) {
      return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getSalesByChannel = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getSalesByChannel(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });
    if (!data) {
      return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getOrdersByChannel = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getOrdersByChannel(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

    if (!data) return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getReturnsOverview = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getReturnsOverview(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

    if (!data) return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};

export const getCancelOrdersOverview = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, startDate, endDate, month, channel } = req.query;

    const data = await dashboardService.getCancelOrdersOverview(sellerIds, period, {
      startDate,
      endDate,
      month,
      channel,
    });

    if (!data) return Responses.failResponse(res, req.locale.NOT_FOUND, 404);
    return Responses.successResponse(res, req.locale.SUCCESS, 200, data);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
