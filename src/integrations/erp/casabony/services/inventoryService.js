import Product from '#root/src/models/Product.js';
import Inventory from '#root/src/models/Inventory.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { createCasabonyAdapter } from '../casabonyAdapter.js';
import { formatCasabonyInventory } from '../helpers/formatInventory.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;
const normalize = (sku) => sku?.trim().toUpperCase();

export const syncCasabonyInventory = async (sellerId, sellerData) => {
  try {
    console.log('[Casabony Inventory Sync] Started');
    const adapter = createCasabonyAdapter();
    const rawProducts = await adapter.fetchProducts(sellerData);

    if (!Array.isArray(rawProducts) || !rawProducts.length) {
      return { message: 'No products returned from Casabony XML' };
    }

    const { products: canonicalProducts } = formatCasabonyInventory(rawProducts, sellerId);

    if (!canonicalProducts.length) {
      return { message: 'No canonical products generated' };
    }

    let updatedCount = 0;
    await processInBatches(
      canonicalProducts,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;
        const skuList = batch.map((p) => normalize(p.productSkuCode));

        const existingProducts = await Product.find(
          { sellerId, productSkuCode: { $in: skuList } },
          { _id: 1, productSkuCode: 1 }
        ).lean();

        const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

        const now = new Date();
        const productOps = [];
        const inventoryOps = [];

        for (const p of batch) {
          const existing = productMap.get(normalize(p.productSkuCode));
          if (!existing) continue;

          productOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: p.productSkuCode },
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
              filter: { sellerId, productSkuCode: p.productSkuCode },
              update: {
                $set: { currentStockCount: p.currentStockCount, updatedAt: now, lastSyncedAt: now },
                $setOnInsert: {
                  sellerId,
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

          console.log(`[Casabony Inventory Sync][Batch ${batchId}] Updated: ${result.modifiedCount}`);

          await resolveHierarchyStatus(
            sellerId,
            batch.map((p) => p.productSkuCode)
          );
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'INVENTORY', updatedCount);
    console.log(`[Casabony Inventory Sync] Completed — Updated: ${updatedCount}`);
    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Casabony Inventory Sync] Failed:', error);
    throw error;
  }
};
