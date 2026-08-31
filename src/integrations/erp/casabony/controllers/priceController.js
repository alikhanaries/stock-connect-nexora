import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncCasabonyPrice } from '../services/priceService.js';

export const syncPrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const sellerData = { sellerId };

    successResponse(res, 'Casabony price sync started in background', 202);

    process.nextTick(async () => {
      try {
        await syncCasabonyPrice(sellerId, sellerData);
      } catch (err) {
        console.error('Background price sync failed for Casabony:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
