import { syncFinance } from '#service/financeService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const syncFinanceData = async (req, res) => {
  try {
    const result = await syncFinance();
    return Responses.successResponse(res, result, 200);
  } catch (error) {
    console.error('Error syncing finance data:', error);
    errorLog(error);
    return Responses.errorResponse(res, error, 500);
  }
};
