import { getTransactionHistory } from '#service/financeService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const getTransactionHistoryData = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, month, startDate, endDate, marketplace, search, page, limit } = req.query;
    const result = await getTransactionHistory(sellerIds, {
      period,
      month,
      startDate,
      endDate,
      marketplace,
      search,
      page,
      limit,
    });
    return Responses.successResponse(res, 'Finance records fetched successfully', 200, result);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
