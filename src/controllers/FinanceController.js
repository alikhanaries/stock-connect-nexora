import { getTransactionHistory, getFinanceDashboard, syncFinance } from '#service/financeService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import { completeSyncJob, failSyncJob, startSyncJob } from '#helpers/syncProgress.js';

export const getTransactionHistoryData = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, month, startDate, endDate, channel, search, page, size } = req.query;
    const result = await getTransactionHistory(sellerIds, {
      period,
      month,
      startDate,
      endDate,
      channel,
      search,
      page,
      size,
    });

    if (!result || !result.content?.length) {
      return Responses.failResponse(res, 'No finance data found', 404);
    }
    return Responses.successResponse(res, 'Finance records fetched successfully', 200, result);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getFinanceDashboardData = async (req, res) => {
  try {
    const sellerIds = req.sellerIds;
    const { period, month, startDate, endDate, channel } = req.query;
    const result = await getFinanceDashboard(sellerIds, { period, month, startDate, endDate, channel });
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

export const syncFinanceData = async (req, res) => {
  try {
    const sellerId = req.query.sellerId || req.sellerId || req.user?._id;
    startSyncJob(sellerId, { label: 'Syncing finance', field: 'finance' });
    Responses.successResponse(res, 'Finance sync started in background', 202);

    setImmediate(async () => {
      try {
        const result = await syncFinance();
        completeSyncJob(sellerId, result);
      } catch (error) {
        console.error('Error syncing finance data:', error);
        errorLog(error);
        failSyncJob(sellerId, error);
      }
    });
  } catch (error) {
    console.error('Error syncing finance data:', error);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
