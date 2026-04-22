import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { exquiseInventorySync } from '../service/inventoryService.js';

export const syncExquiseInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      exquiseInventorySync(sellerId).catch((err) =>
        console.error('[Exquise Inventory Sync] Background job failed:', err)
      );
    });

    return successResponse(res, 'Exquise inventory sync started in background', 202);
  } catch (error) {
    console.error('[Exquise Inventory Sync] Start failed:', error);
    return errorResponse(res, error.message);
  }
};
