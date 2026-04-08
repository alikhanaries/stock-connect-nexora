import { getFinanceDashboard } from '#service/financeService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const getFinanceDashboardData = async (req, res) => {
  try {
    const { period, month, startDate, endDate, marketplace } = req.query;
    const sellerId = req.sellerId;
    const result = await getFinanceDashboard({ sellerId, period, month, startDate, endDate, marketplace });
    return Responses.successResponse(res, 'Finance dashboard fetched successfully', 200, result);
  } catch (error) {
    console.error('Error fetching finance dashboard:', error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
