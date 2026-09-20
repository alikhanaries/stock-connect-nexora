import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncShopifyXokidsPrice } from '../service/priceService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import Seller from '#models/Seller.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

export const syncXokidsPrice = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const [shopifyConfig, seller] = await Promise.all([
      getShopifyConfig(sellerId),
      Seller.findById(sellerId, { name: 1 }).lean(),
    ]);

    if (!shopifyConfig) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    const brandName = seller?.name;

    trackBackgroundSync(sellerId, () => syncShopifyXokidsPrice(sellerId, shopifyConfig), {
      label: 'Syncing prices',
      field: 'pricing',
    });
    successResponse(res, `Xokids price sync started in background for ${brandName}`, 202);
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
