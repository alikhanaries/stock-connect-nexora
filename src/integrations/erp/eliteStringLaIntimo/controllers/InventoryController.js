import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getEliteStringLaIntimoStock } from '../services/inventoryService.js';

export const syncEliteStringLaIntimoStock = (req, res) => {
  try {
    const sellerId = req.sellerId;

    process.nextTick(() => {
      getEliteStringLaIntimoStock(sellerId).catch((err) =>
        console.error('Elite String La Intimo stock background sync failed:', err)
      );
    });

    return successResponse(res, 'Elite String La Intimo stock sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Elite String La Intimo sync:', error);
    return errorResponse(res, error.message);
  }
};
