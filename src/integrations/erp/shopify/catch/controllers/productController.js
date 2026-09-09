import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreShopifyCatchProducts } from '../service/productService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

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

    trackBackgroundSync(sellerId, () => fetchAndStoreShopifyCatchProducts(sellerId, shopifyConfig), {
      label: 'Syncing Shopify products',
      field: 'products',
    });
    successResponse(res, 'Shopify product sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
