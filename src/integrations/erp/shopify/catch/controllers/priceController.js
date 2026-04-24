import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncShopifyCatchPrice } from '../service/priceService.js';
import { getShopifyConfig } from '../service/shopifyService.js';

export const SyncCatchPrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const shopifyConfig = await getShopifyConfig(sellerId);

    if (!shopifyConfig) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    successResponse(res, 'Shopify price sync started in background', 202);

    process.nextTick(async () => {
      try {
        await syncShopifyCatchPrice(sellerId, shopifyConfig);
      } catch (err) {
        console.error('[Catch Price Sync] Background job failed:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
