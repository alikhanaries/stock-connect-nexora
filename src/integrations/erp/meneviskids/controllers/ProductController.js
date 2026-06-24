import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { getMeneviskidsProducts } from '../services/productService.js';

export const syncMeneviskidsProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.query.isImageUpdate === 'true';

    setImmediate(() => {
      getMeneviskidsProducts(sellerId, isImageUpdate).catch((err) =>
        console.error('Menevis Kids background sync failed:', err)
      );
    });

    return successResponse(res, 'Menevis Kids product sync started in background', 202);
  } catch (error) {
    console.error('Failed to start Menevis Kids sync:', error);
    return errorResponse(res, error.message);
  }
};
