import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { kipInventorySync } from '../services/inventoryService.js';

export const syncKipInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      kipInventorySync(sellerId).catch((err) => console.error('[KIP Inventory Sync] Background job failed:', err));
    });

    return successResponse(res, 'KIP inventory sync started in background', 202);
  } catch (error) {
    console.error('[KIP Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
