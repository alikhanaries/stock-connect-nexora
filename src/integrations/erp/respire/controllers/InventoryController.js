import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { respireInventorySync } from '../service/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncRespireInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => respireInventorySync(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'Respire inventory sync started in background', 202);
  } catch (error) {
    console.error('[Respire Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
