import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { syncShopifyXokidsInventory } from '../service/inventoryService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import Seller from '#models/Seller.js';

export const syncXokidsInventory = async (req, res) => {
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

    ///  Accepted for async/background processing
    successResponse(res, `Shopify inventory sync started in background for ${brandName}`, 202);

    setImmediate(async () => {
      try {
        await syncShopifyXokidsInventory(sellerId, shopifyConfig);
      } catch (err) {
        console.error('Background inventory sync failed for Xokids:', err);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
