import { errorResponse, failResponse, successResponse } from '#root/src/helpers/response.js';
import { pushOrdersService } from '../service/orderService.js';
import { getShopifyConfig } from '../service/shopifyService.js';
import { trackBackgroundSync } from '#helpers/syncProgress.js';

const syncInProgress = new Set();

export const pushOrders = async (req, res) => {
  const sellerId = req.sellerId;
  try {
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

    trackBackgroundSync(
      sellerId,
      async () => {
        try {
          return await pushOrdersService(sellerId);
        } finally {
          syncInProgress.delete(sellerId);
        }
      },
      { label: 'Syncing orders', field: 'orders' }
    );
    successResponse(res, 'Shopify order sync started in background', 202);
  } catch (error) {
    if (sellerId) syncInProgress.delete(sellerId);
    return errorResponse(res, error, 500);
  }
};
