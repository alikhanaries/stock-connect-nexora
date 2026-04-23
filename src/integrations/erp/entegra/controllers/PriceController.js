import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { entegraPriceSync } from '../service/priceService.js';

export const syncEntegraPrice = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      entegraPriceSync(sellerId).catch((err) => console.error('[Entegra Price Sync] Background job failed:', err));
    });

    return successResponse(res, 'Entegra price sync started in background', 202);
  } catch (error) {
    console.error('[Entegra Price Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
