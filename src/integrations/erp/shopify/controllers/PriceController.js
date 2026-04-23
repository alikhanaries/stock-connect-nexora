import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { fetchShopifyCredentials } from '../service/shopifyService.js';
import { shopifyPriceSync } from '../service/priceService.js';

export const syncShopifyPrice = async (req, res) => {
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

    successResponse(res, 'Shopify price sync started in background', 202);

    process.nextTick(async () => {
      try {
        await shopifyPriceSync(sellerId, shopifyConfig);
      } catch (err) {
        console.error('[Shopify Price Sync] Background job failed:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
