import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { kipPriceSync } from '../services/priceService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncKipPrice = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => kipPriceSync(sellerId), {
      label: 'Syncing prices',
      field: 'pricing',
    });

    return successResponse(res, 'KIP price sync started in background', 202);
  } catch (error) {
    console.error('[KIP Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
