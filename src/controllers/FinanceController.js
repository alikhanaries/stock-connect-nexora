import { getFinanceDashboard, syncFinance } from '#service/financeService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const getFinanceDashboardData = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, month, startDate, endDate, marketplace } = req.query;
    const result = await getFinanceDashboard(sellerIds, { period, month, startDate, endDate, marketplace });
    if (!result || !result.length) {
      return Responses.failResponse(res, 'No finance data found', 404);
    }
    return Responses.successResponse(res, 'Finance dashboard fetched successfully', 200, result);
  } catch (error) {
    console.error('Error fetching finance dashboard:', error);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const syncFinanceData = async (_req, res) => {
  try {
    const result = await syncFinance();
    return Responses.successResponse(res, result, 200);
  } catch (error) {
    console.error('Error syncing finance data:', error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
