import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { RamseyInventorySync } from '../services/inventoryService.js';

export const syncRamseyInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      RamseyInventorySync(sellerId).catch((err) =>
        console.error('[Ramsey Inventory Sync] Background job failed:', err)
      );
    });

    return successResponse(res, 'Ramsey inventory sync started in background', 202);
  } catch (error) {
    console.error('[Ramsey Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
