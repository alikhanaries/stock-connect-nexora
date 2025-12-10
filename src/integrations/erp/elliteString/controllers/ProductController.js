import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getElliteStringStock } from '../services/productService.js';

export const syncElliteStringStock = (req, res) => {
  try {
    const sellerId = req.sellerId;

    process.nextTick(() => {
      getElliteStringStock(sellerId).catch((err) => console.error('ElliteString stock background sync failed:', err));
    });

    return successResponse(res, 'ElliteString stock sync started in background', 202);
  } catch (error) {
    console.error('Failed to start ElliteString sync:', error);
    return errorResponse(res, error.message);
  }
};
