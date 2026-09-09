import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreCasabonyProducts } from '../services/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const isImageUpdate = req.query.isImageUpdate === 'true';

    trackBackgroundSync(sellerId, () => fetchAndStoreCasabonyProducts(sellerId, isImageUpdate), {
      label: 'Syncing products',
      field: 'products',
    });
    successResponse(res, 'Casabony product sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
