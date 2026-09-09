import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncCasabonyInventory } from '../services/inventoryService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncInventory = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const sellerData = { sellerId };

    trackBackgroundSync(sellerId, () => syncCasabonyInventory(sellerId, sellerData), {
      label: 'Syncing inventory',
      field: 'inventory',
    });
    successResponse(res, 'Casabony inventory sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
