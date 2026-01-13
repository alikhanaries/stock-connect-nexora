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
