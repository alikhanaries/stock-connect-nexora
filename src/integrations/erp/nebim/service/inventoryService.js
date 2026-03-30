import Product from '#root/src/models/Product.js';
import Inventory from '#root/src/models/Inventory.js';

import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';

import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';

import { formatExquiseInventory } from '../helpers/formatInventory.js';
import { createERPAdapter } from '../../base/ERPFactory.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => sku?.trim().toUpperCase();
const adapter = createERPAdapter('nebim');
export const exquiseInventorySync = async (sellerId) => {
  try {
    console.log('[Exquise Inventory Sync] Started');

    const rawProducts = await adapter.fetchProducts();

    if (!rawProducts.length)
      return {
        message: 'No products returned from Nebim',
      };

    let updatedCount = 0;

    await processInBatches(
      rawProducts,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;

        console.log(`[Batch ${batchId}] Processing ${batch.length} rows`);

        const { products } = formatExquiseInventory(batch, sellerId);

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
          const result = await Product.bulkWrite(productOps, { ordered: false });

          await Inventory.bulkWrite(inventoryOps, { ordered: false });

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

    await updateSyncDate(sellerId, 'INVENTORY', updatedCount);

    console.log(`[Exquise Inventory Sync] Completed — Updated: ${updatedCount}`);

    return {
      success: true,
      updatedCount,
    };
  } catch (error) {
    console.error('[Exquise Inventory Sync] Failed:', error);

    throw error;
  }
};
