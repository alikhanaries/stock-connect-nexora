import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { ramseyPriceSync } from '../services/priceService.js';

export const syncRamseyPrice = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      ramseyPriceSync(sellerId).catch((err) => console.error('[Ramsey Price Sync] Background job failed:', err));
    });

    return successResponse(res, 'Ramsey price sync started in background', 202);
  } catch (error) {
    console.error('[Ramsey Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
