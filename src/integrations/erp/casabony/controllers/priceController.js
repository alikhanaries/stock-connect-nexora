import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncCasabonyPrice } from '../services/priceService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncPrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const sellerData = { sellerId };

    trackBackgroundSync(sellerId, () => syncCasabonyPrice(sellerId, sellerData), {
      label: 'Syncing prices',
      field: 'pricing',
    });
    successResponse(res, 'Casabony price sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
