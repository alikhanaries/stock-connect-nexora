import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import Product from '#root/src/models/Product.js';
import Inventory from '#root/src/models/Inventory.js';
import { createXokidsAdapter } from '../xokidsAdapter.js';
import { formatXokidsInventory } from '../helpers/formatInventory.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => sku?.trim().toUpperCase();

export const xokidsInventorySync = async (sellerId) => {
  try {
    const adapter = createXokidsAdapter();
    const productsFromApi = await adapter.fetchProducts();

    if (!productsFromApi.length) {
      return { message: 'No Xokids products found for inventory sync.' };
    }

    console.log(`[Xokids Inventory Sync] Started`);

    let updatedCount = 0;

    await processInBatches(
      productsFromApi,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;
        console.log(`\n[Batch ${batchId}] Processing ${batch.length} items`);

        try {
          const skuSet = new Set();

          for (const p of batch) {
            const base = normalize(p.ws_code);
            if (!base) continue;

            skuSet.add(base);

            const subs = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

            const seenParents = new Set();

            for (const s of subs) {
              const color = normalize(s.type1) || 'DEFAULT';
              const size = normalize(s.type2) || 'NOSIZE';

              const parentSku = `${base}-${color.replace(/\s+/g, '_')}`;

              if (!seenParents.has(parentSku)) {
                skuSet.add(parentSku);
                seenParents.add(parentSku);
              }

              skuSet.add(`${parentSku}-${size.replace(/\s+/g, '_')}`);
            }
          }

          const skuList = [...skuSet];

          const existingProducts = await Product.find(
            { sellerId, productSkuCode: { $in: skuList } },
            { _id: 1, productSkuCode: 1 }
          ).lean();

          const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

          const existingSkus = new Set(productMap.keys());

          const { products } = formatXokidsInventory(batch, sellerId);

          const validProducts = products.filter((p) => existingSkus.has(normalize(p.productSkuCode)));

          if (!validProducts.length) return;

          const now = new Date();

          const productOps = validProducts.map((p) => ({
            updateOne: {
              filter: {
                sellerId: p.sellerId,
                productSkuCode: p.productSkuCode,
              },
              update: {
                $set: {
                  currentStockCount: p.currentStockCount,
                  status: p.status,
                  productType: p.productType,
                  updatedAt: now,
                },
              },
            },
          }));

          const inventoryOps = validProducts.map((p) => {
            const prod = productMap.get(normalize(p.productSkuCode));

            return {
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
                    productId: prod?._id || null,
                    productSkuCode: p.productSkuCode,
                    createdAt: now,
                  },
                },
                upsert: true,
              },
            };
          });

          const productResult = await Product.bulkWrite(productOps, { ordered: false });
          await Inventory.bulkWrite(inventoryOps, { ordered: false });

          updatedCount += productResult.matchedCount;

          console.log(
            `[Batch ${batchId}] Matched: ${productResult.matchedCount}, Modified: ${productResult.modifiedCount}`
          );

          await resolveHierarchyStatus(
            sellerId,
            validProducts.map((p) => p.productSkuCode)
          );
        } catch (err) {
          console.error(`[Batch ${batchId}] Error`, err);
          throw err;
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'INVENTORY', updatedCount);

    console.log(`[Xokids Inventory Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Xokids Inventory Sync] Failed:', error);
    throw error;
  }
};
