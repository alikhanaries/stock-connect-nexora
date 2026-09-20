import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import Seller from '#models/Seller.js';
import { isSentosConfigured } from '../config/config.js';
import { isSentosSellerSlug } from '../helpers/sellerHelper.js';
import { sentosInventorySync } from '../services/inventoryService.js';
import { syncStockToChannelEngine } from '#service/InventoryService.js';

export const syncSentosInventory = async (req, res) => {
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
      sentosInventorySync(sellerId)
        .then(() => syncStockToChannelEngine(sellerId))
        .catch((err) => console.error('[Sentos Inventory Sync] background job failed:', err.message));
    });

    return successResponse(res, 'Sentos inventory sync started in background', 202);
  } catch (error) {
    console.error('[Sentos Inventory Sync] start failed:', error.message);
    return errorResponse(res, error.message);
  }
};
