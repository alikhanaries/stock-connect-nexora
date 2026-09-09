import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchAndStoreShopifyProducts } from '../service/productService.js';
import { fetchShopifyCredentials } from '#root/src/integrations/erp/shopify/service/shopifyService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';
export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }
    const sellerData = await fetchShopifyCredentials(sellerId);

    const shopifyConfig = sellerData?.shopifyConfig;

    if (!shopifyConfig?.url || !shopifyConfig?.apiVersion || !shopifyConfig?.accessToken) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    ///  Accepted for async/background processing
    trackBackgroundSync(sellerId, () => fetchAndStoreShopifyProducts(sellerId, shopifyConfig), {
      label: 'Syncing Shopify products',
      field: 'products',
    });
    successResponse(res, 'Shopify product sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
