import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#models/Seller.js';
import { isSentosConfigured } from '../config/config.js';
import { isSentosSellerSlug } from '../helpers/sellerHelper.js';
import { sentosPriceSync } from '../services/priceService.js';
import { syncPriceToChannelEngine } from '#service/priceService.js';

export const syncSentosPrice = async (req, res) => {
  try {
    if (!isSentosConfigured()) {
      return errorResponse(res, 'Sentos integration is not configured');
    }

    const sellerId = req.sellerId;
    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();

    if (!seller?.slug) {
      return errorResponse(res, `Seller ${sellerId} not found or missing slug`);
    }

    if (!isSentosSellerSlug(seller.slug)) {
      return errorResponse(res, `Seller slug "${seller.slug}" is not configured for Sentos`);
    }

    process.nextTick(() => {
      sentosPriceSync(sellerId)
        .then(() => syncPriceToChannelEngine(sellerId))
        .catch((err) => console.error('[Sentos Price Sync] background job failed:', err.message));
    });

    return successResponse(res, 'Sentos price sync started in background', 202);
  } catch (error) {
    console.error('[Sentos Price Sync] start failed:', error.message);
    return errorResponse(res, error.message);
  }
};
