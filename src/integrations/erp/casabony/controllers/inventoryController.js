import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncCasabonyInventory } from '../services/inventoryService.js';

export const syncInventory = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const sellerData = { sellerId };

    successResponse(res, 'Casabony inventory sync started in background', 202);

    process.nextTick(async () => {
      try {
        await syncCasabonyInventory(sellerId, sellerData);
      } catch (err) {
        console.error('Background inventory sync failed for Casabony:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
