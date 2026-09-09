import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getMeneviskidsProducts } from '../services/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncMeneviskidsProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';

    trackBackgroundSync(sellerId, () => getMeneviskidsProducts(sellerId, isImageUpdate), {
      label: 'Syncing products',
      field: 'products',
    });

    return successResponse(res, 'Menevis Kids product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Menevis Kids sync:', error);
    return errorResponse(res, error.message);
  }
};
