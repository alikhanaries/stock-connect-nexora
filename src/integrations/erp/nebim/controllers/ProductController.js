import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreNebimProducts } from '../service/productService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    trackBackgroundSync(sellerId, () => fetchAndStoreNebimProducts(sellerId), {
      label: 'Syncing products',
      field: 'products',
    });
    successResponse(res, 'Nebim product sync started in background', 202);
  } catch (error) {
    errorResponse(res, error, 500);
  }
};
