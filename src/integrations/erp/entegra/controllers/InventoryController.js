import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { entegraInventorySync } from '../service/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncEntegraInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => entegraInventorySync(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'Entegra inventory sync started in background', 202);
  } catch (error) {
    console.error('[Entegra Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
