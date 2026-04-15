import Product from '#models/Product.js';
import Inventory from '#root/src/models/Inventory.js';

import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';

import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';

import { getAccessToken } from '../utils/accessTokenGenerator.js';

import { formatEntegraInventory } from '../helpers/formatInventory.js';

import { convertCodeFormat } from '../helpers/commonHelper.js';
import { fetchProductsPage } from './productService.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => convertCodeFormat(sku)?.trim().toUpperCase();

export const entegraInventorySync = async (sellerId) => {
  try {
    console.log('[ENTEGRA Inventory Sync] Started');

    const AUTH_TOKEN = await getAccessToken();

    let page = 1;
    let updatedCount = 0;

    while (true) {
      const response = await fetchProductsPage(page, AUTH_TOKEN);

      const list = response?.productList;

      if (!Array.isArray(list) || !list.length) {
        console.log('No more inventory pages.');
        break;
      }

      await processInBatches(
        list,
        MAX_BATCH_SIZE,
        async (batch, index) => {
          const batchId = index + 1;

          console.log(`[Batch ${batchId}] Processing ${batch.length} products`);

          const { products } = formatEntegraInventory(batch, sellerId);

          if (!products.length) return;

          const skuList = products.map((p) => normalize(p.productSkuCode));

          const existingProducts = await Product.find(
            {
              sellerId,
              productSkuCode: {
                $in: skuList,
              },
            },
            {
              _id: 1,
              productSkuCode: 1,
            }
          ).lean();

          const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

          const now = new Date();

          const productOps = [];
          const inventoryOps = [];

          for (const p of products) {
            const existing = productMap.get(normalize(p.productSkuCode));

            if (!existing) continue;

            productOps.push({
              updateOne: {
                filter: {
                  sellerId: p.sellerId,
                  productSkuCode: p.productSkuCode,
                },
                update: {
                  $set: {
                    currentStockCount: p.currentStockCount,
                    status: p.status,
                    updatedAt: now,
                  },
                },
              },
            });

            inventoryOps.push({
              updateOne: {
                filter: {
                  sellerId: p.sellerId,
                  productSkuCode: p.productSkuCode,
                },
                update: {
                  $set: {
                    currentStockCount: p.currentStockCount,
                    updatedAt: now,
                    lastSyncedAt: now,
                  },
                  $setOnInsert: {
                    sellerId: p.sellerId,
                    productId: existing._id,
                    productSkuCode: p.productSkuCode,
                    createdAt: now,
                  },
                },
                upsert: true,
              },
            });
          }

          if (productOps.length) {
            const result = await Product.bulkWrite(productOps, {
              ordered: false,
            });

            await Inventory.bulkWrite(inventoryOps, {
              ordered: false,
            });

            updatedCount += result.matchedCount;

            console.log(`[Batch ${batchId}] Updated: ${result.modifiedCount}`);

            await resolveHierarchyStatus(
              sellerId,
              products.map((p) => p.productSkuCode)
            );
          }
        },
        BATCH_CONCURRENCY
      );

      page++;
    }

    await updateSyncDate(sellerId, 'INVENTORY', updatedCount);

    console.log(`[Entegra Inventory Sync] Completed — Updated: ${updatedCount}`);

    return {
      success: true,
      updatedCount,
    };
  } catch (error) {
    console.error('[Entegra Inventory Sync] Failed:', error);

    throw error;
  }
};
