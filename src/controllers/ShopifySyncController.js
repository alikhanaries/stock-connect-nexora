import { failResponse, successResponse, errorResponse } from '#helpers/response.js';
import { fetchShopifyCredentials } from '#root/src/integrations/erp/shopify/service/shopifyService.js';
import { fetchAndStoreShopifyProducts } from '#root/src/integrations/erp/shopify/service/productService.js';
import { getSyncProgress, trackBackgroundSync } from '#helpers/syncProgress.js';

export const startShopifySync = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const isImageUpdate = req.body?.isImageUpdate === true || req.body?.isImageUpdate === 'true';

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const sellerData = await fetchShopifyCredentials(sellerId);
    const shopifyConfig = sellerData?.shopifyConfig;

    if (!shopifyConfig?.url || !shopifyConfig?.apiVersion || !shopifyConfig?.accessToken) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    trackBackgroundSync(sellerId, () => fetchAndStoreShopifyProducts(sellerId, { ...shopifyConfig, isImageUpdate }), {
      label: 'Syncing Shopify products',
      field: 'products',
    });

    return successResponse(res, 'Shopify product sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};

export const getShopifySyncStatus = (req, res) => {
  try {
    const sellerId = req.sellerId;
    const progress = getSyncProgress(sellerId);
    if (!progress) {
      return failResponse(res, 'No active sync', 404);
    }
    return successResponse(res, progress.operations?.[0]?.label || 'Sync', 200, progress);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
