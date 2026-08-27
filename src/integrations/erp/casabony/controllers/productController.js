import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreCasabonyProducts } from '../services/productService.js';

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) return failResponse(res, 'sellerId is missing', 400);

    const isImageUpdate = req.query.isImageUpdate === 'true';

    successResponse(res, 'Casabony product sync started in background', 202);

    process.nextTick(async () => {
      try {
        await fetchAndStoreCasabonyProducts(sellerId, isImageUpdate);
      } catch (err) {
        console.error('Background sync failed for Casabony:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
