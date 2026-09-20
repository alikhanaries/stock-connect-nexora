import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncShopifyExquisePrice } from '../service/priceService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncExquisePrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const shopifyConfig = await getShopifyConfig(sellerId);

    if (!shopifyConfig) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    trackBackgroundSync(sellerId, () => syncShopifyExquisePrice(sellerId, shopifyConfig), {
      label: 'Syncing prices',
      field: 'pricing',
    });
    successResponse(res, 'Exquise price sync started in background', 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
