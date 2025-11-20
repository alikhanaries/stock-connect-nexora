import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getRamseyProducts } from '../services/productService.js';

export const syncRamseyProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;
    process.nextTick(() => {
      getRamseyProducts(sellerId).catch((err) => console.error('Ramsey product sync (Gürmen Group) failed:', err));
    });
    return successResponse(res, 'Ramsey product sync (Gürmen Group) started in background.', 202);
  } catch (error) {
    console.error('Unable to start Ramsey product sync (Gürmen Group):', error);
    return errorResponse(res, error.message);
  }
};
