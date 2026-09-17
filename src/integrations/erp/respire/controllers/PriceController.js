import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#root/src/models/Seller.js';
import { respirePriceSync } from '../service/priceService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncRespirePrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) return errorResponse(res, `Seller ${sellerId} not found or missing slug`);

    trackBackgroundSync(sellerId, () => respirePriceSync(sellerId), {
      label: 'Syncing prices',
      field: 'pricing',
    });

    return successResponse(res, 'Respire price sync started in background', 202);
  } catch (error) {
    console.error('[Respire Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
