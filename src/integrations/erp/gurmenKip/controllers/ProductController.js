import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getGurmanProducts } from '../services/productService.js';

export const syncGurmanProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;

    process.nextTick(() => {
      getGurmanProducts(sellerId).catch((err) => console.error('Gürmen Group (KIP) background sync failed:', err));
    });

    return successResponse(res, 'Gürmen Group (KIP) product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Gürmen Group (KIP) sync:', error);
    return errorResponse(res, error.message);
  }
};
