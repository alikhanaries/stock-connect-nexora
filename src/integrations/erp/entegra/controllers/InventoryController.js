import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { entegraInventorySync } from '../service/inventoryService.js';

export const syncEntegraInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      entegraInventorySync(sellerId).catch((err) =>
        console.error('[Entegra Inventory Sync] Background job failed:', err)
      );
    });

    return successResponse(res, 'Entegra inventory sync started in background', 202);
  } catch (error) {
    console.error('[Entegra Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
