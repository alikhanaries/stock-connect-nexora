import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { xokidsInventorySync } from '../services/inventoryService.js';

export const syncXokidsInventory = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      xokidsInventorySync(sellerId).catch((err) => console.error('Xokids inventory sync failed:', err));
    });

    return successResponse(res, 'Xokids inventory sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Xokids inventory sync:', error);
    return errorResponse(res, error.message);
  }
};
