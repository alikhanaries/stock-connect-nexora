import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreShopifyCatchProducts } from '../service/productService.js';
import { getShopifyConfig } from '../service/shopifyService.js';

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const shopifyConfig = await getShopifyConfig(sellerId);

    if (!shopifyConfig) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    // Accepted for async/background processing
    successResponse(res, 'Shopify product sync started in background', 202);

    process.nextTick(async () => {
      try {
        await fetchAndStoreShopifyCatchProducts(sellerId, shopifyConfig);
      } catch (err) {
        console.error('Background sync failed:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
