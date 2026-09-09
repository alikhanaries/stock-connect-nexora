import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getEliteStringLaIntimoStock } from '../services/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncEliteStringLaIntimoStock = (req, res) => {
  try {
    const sellerId = req.sellerId;

    trackBackgroundSync(sellerId, () => getEliteStringLaIntimoStock(sellerId), {
      label: 'Syncing inventory',
      field: 'inventory',
    });

    return successResponse(res, 'Elite String La Intimo stock sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Elite String La Intimo sync:', error);
    return errorResponse(res, error.message);
  }
};
