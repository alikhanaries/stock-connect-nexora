import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncShopifyXokidsPrice } from '../service/priceService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import Seller from '#models/Seller.js';

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

    successResponse(res, `Xokids price sync started in background for ${brandName}`, 202);

    setImmediate(async () => {
      try {
        await syncShopifyXokidsPrice(sellerId, shopifyConfig);
      } catch (err) {
        console.error('[Xokids Price Sync] Background job failed:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
