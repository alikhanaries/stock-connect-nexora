import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { exquiseInventorySync } from '../service/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncExquiseInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => exquiseInventorySync(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'Exquise inventory sync started in background', 202);
  } catch (error) {
    console.error('[Exquise Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
