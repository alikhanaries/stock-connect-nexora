import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreShopifyProducts } from '../service/productService.js';

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    successResponse(res, 'Shopify product sync started in background', 202);
    process.nextTick(async () => {
      try {
        await fetchAndStoreShopifyProducts(sellerId);
      } catch (err) {
        console.error('Background sync failed:', err);
      }
    });
  } catch (error) {
    errorResponse(res, error, 500);
  }
};
