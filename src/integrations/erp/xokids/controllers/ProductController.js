import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getXokidsProducts } from '../services/productService.js';

export const syncXokidsProducts = (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';
    process.nextTick(() => {
      getXokidsProducts(sellerId, isImageUpdate).catch((err) => console.error('Xokids background sync failed:', err));
    });

    return successResponse(res, 'Xokids product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Xokids sync:', error);
    return errorResponse(res, error.message);
  }
};
