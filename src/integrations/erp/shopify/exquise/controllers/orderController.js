import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { pushOrdersService } from '../service/orderService.js';
import { getShopifyConfig } from '../service/shopifyService.js';

export const pushOrders = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      return failResponse(res, 'sellerId is missing', 400);
    }

    const shopifyConfig = await getShopifyConfig(sellerId);

    if (!shopifyConfig) {
      return failResponse(res, 'Incomplete Shopify credentials (url, apiVersion, accessToken required)', 400);
    }

    successResponse(res, 'Shopify order sync started in background', 202);

    setImmediate(async () => {
      try {
        await pushOrdersService(sellerId);
      } catch (err) {
        console.error('[ExquiseOrderSync] Background sync failed:', err.message);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
