import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getGurmanProducts } from '../services/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncGurmanProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';
    trackBackgroundSync(sellerId, () => getGurmanProducts(sellerId, isImageUpdate), {
      label: 'Syncing products',
      field: 'products',
    });

    return successResponse(res, 'Gürmen Group (KIP) product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Gürmen Group (KIP) sync:', error);
    return errorResponse(res, error.message);
  }
};
