import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { RamseyInventorySync } from '../services/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncRamseyInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => RamseyInventorySync(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'Ramsey inventory sync started in background', 202);
  } catch (error) {
    console.error('[Ramsey Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
