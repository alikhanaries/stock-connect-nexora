import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { pushOrdersService } from '../service/orderService.js';
import { getShopifyConfig } from '../service/shopifyService.js';

const syncInProgress = new Set();

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

    if (syncInProgress.has(sellerId)) {
      return failResponse(res, 'Sync already in progress for this seller', 409);
    }
    syncInProgress.add(sellerId);

    successResponse(res, 'Shopify order sync started in background', 202);

    setImmediate(async () => {
      try {
        await pushOrdersService(sellerId);
      } catch (err) {
        console.error('[ExquiseOrderSync] Background sync failed:', err.message);
      } finally {
        syncInProgress.delete(sellerId);
      }
    });
  } catch (error) {
    return errorResponse(res, error, 500);
  }
};
