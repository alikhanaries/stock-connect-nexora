import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { kipPriceSync } from '../services/priceService.js';

export const syncKipPrice = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      kipPriceSync(sellerId).catch((err) => console.error('[KIP Price Sync] Background job failed:', err));
    });

    return successResponse(res, 'KIP price sync started in background', 202);
  } catch (error) {
    console.error('[KIP Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
