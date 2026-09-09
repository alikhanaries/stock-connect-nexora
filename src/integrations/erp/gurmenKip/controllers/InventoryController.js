import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { kipInventorySync } from '../services/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncKipInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => kipInventorySync(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'KIP inventory sync started in background', 202);
  } catch (error) {
    console.error('[KIP Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
