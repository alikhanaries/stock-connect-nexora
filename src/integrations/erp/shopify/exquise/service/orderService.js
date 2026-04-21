import {
  formatOrdersToShopifyPayloads,
  formatOrdersToShopifyUpdatePayloads,
} from '#root/src/integrations/erp/shopify/exquise/helpers/formatter.js';
import {
  createShopifyOrder,
  getShopifyConfig,
  lookupVariantIdsBySkus,
  updateShopifyOrder,
} from '#root/src/integrations/erp/shopify/exquise/service/shopifyService.js';
import Order from '#root/src/models/Orders.js';
import { Types } from 'mongoose';

export const pushOrdersService = async (sellerId) => {
  try {
    const config = await getShopifyConfig(sellerId);
    if (!config) {
      return { message: 'Incomplete Shopify credentials' };
    }

    const sellerObjectId = new Types.ObjectId(sellerId);

    const orders = await Order.aggregate([
      {
        $match: {
          sellerId: sellerObjectId,
          'orderSkuList.skuList': { $type: 'array', $ne: [] },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: 'orderSkuList.skuList.sku',
          foreignField: '_id',
          as: 'products',
        },
      },
      {
        $match: {
          $expr: {
            $eq: [
              {
                $size: {
                  $setUnion: [{ $ifNull: ['$orderSkuList.skuList.sku', []] }, []],
                },
              },
              { $size: '$products' },
            ],
          },
        },
      },
      {
        $match: {
          products: {
            $not: {
              $elemMatch: {
                source: { $ne: 'SHOPIFY' },
              },
            },
          },
        },
      },
    ]);

    if (!orders.length) {
      return { message: 'No orders eligible for Shopify sync' };
    }
    const createOrders = orders.filter((o) => !o.shopifySync?.shopifyOrderId);
    const updateOrders = orders.filter((o) => o.shopifySync?.shopifyOrderId);
    const allSkus = orders.flatMap((o) =>
      (o.orderSkuList?.skuList || []).map((s) => s.merchantProductNo).filter(Boolean)
    );
    const skuToVariantId = await lookupVariantIdsBySkus(config, allSkus);

    const createPayloads = formatOrdersToShopifyPayloads(createOrders, skuToVariantId);
    const updatePayloads = formatOrdersToShopifyUpdatePayloads(updateOrders);

    const results = [];

    for (const payload of createPayloads) {
      try {
        const res = await createShopifyOrder(config, payload);

        if (!res.success) {
          console.error(`[ExquiseOrderSync] CREATE failed - order ${payload.order._id}: ${res.error}`);
          await markShopifyFailed(payload.order._id);
          continue;
        }

        await Order.updateOne(
          { _id: payload.order._id },
          {
            $set: {
              'shopifySync.shopifyOrderId': res.shopifyOrderId,
              'shopifySync.shopifySyncStatus': 'SYNCED',
              'shopifySync.pushedToShopifyAt': new Date(),
            },
          }
        );

        results.push({
          orderId: payload.order._id,
          action: 'CREATED',
        });
      } catch (err) {
        console.error(`[ExquiseOrderSync] CREATE error - order ${payload.order._id}:`, err.message);
        await markShopifyFailed(payload.order._id);
      }
    }

    for (const payload of updatePayloads) {
      try {
        const updateRes = await updateShopifyOrder(config, payload.shopifyOrderId, payload);

        if (!updateRes.success) {
          console.error(`[ExquiseOrderSync] UPDATE failed - order ${payload._id}: ${updateRes.error}`);
          await markShopifyFailed(payload._id);
          continue;
        }

        await Order.updateOne(
          { _id: payload._id },
          {
            $set: {
              'shopifySync.shopifySyncStatus': 'SYNCED',
              'shopifySync.pushedToShopifyAt': new Date(),
            },
          }
        );

        results.push({
          orderId: payload._id,
          action: 'UPDATED',
        });
      } catch (err) {
        console.error(`[ExquiseOrderSync] UPDATE error - order ${payload._id}:`, err.message);
        await markShopifyFailed(payload._id);
      }
    }

    return results;
  } catch (err) {
    console.error(`[ExquiseOrderSync] pushOrdersService error for sellerId ${sellerId}:`, err.message);
    throw err;
  }
};

const markShopifyFailed = async (orderId) => {
  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        'shopifySync.shopifySyncStatus': 'FAILED',
      },
    }
  );
};
