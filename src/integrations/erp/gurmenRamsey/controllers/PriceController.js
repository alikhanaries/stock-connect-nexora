import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { ramseyPriceSync } from '../services/priceService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncRamseyPrice = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => ramseyPriceSync(sellerId), {
      label: 'Syncing prices',
      field: 'pricing',
    });

    return successResponse(res, 'Ramsey price sync started in background', 202);
  } catch (error) {
    console.error('[Ramsey Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
