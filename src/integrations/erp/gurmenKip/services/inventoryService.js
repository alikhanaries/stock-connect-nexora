import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import Product from '#root/src/models/Product.js';
import { createGurmanKipAdapter } from '../gurmanAdapter.js';
import { formatInventory } from '../helpers/formatInventory.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const syncInventory = async (sellerId) => {
  try {
    const gurman = createGurmanKipAdapter();
    const fetched = await gurman.fetchProducts();

    if (!fetched.length) {
      return { message: 'No Gürmen Group (KIP) products to sync.' };
    }

    console.log(`[KIP Sync] Started — Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);

    let updatedCount = 0;

    const normalize = (sku) => sku?.trim().toUpperCase();

    await processInBatches(
      fetched,
      MAX_BATCH_SIZE,
      async (batch, batchIndex) => {
        const batchId = batchIndex + 1;
        const startTime = Date.now();
        const incomingSkus = new Set();

        console.log(`\n[Batch ${batchId}] Started — Items: ${batch.length}`);

        try {
          for (const p of batch) {
            const gp = normalize(p.ws_code || p.code || '');
            if (gp) incomingSkus.add(gp);

            const subs = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

            for (const s of subs) {
              const color = (s.color || s.color_drop || '').trim() || 'DEFAULT';
              const size = (s.size || '').trim() || 'NOSIZE';

              const sku = `${gp}-${color.replace(/\s+/g, '_').toUpperCase()}-${size
                .replace(/\s+/g, '_')
                .toUpperCase()}`;

              incomingSkus.add(normalize(sku));
            }
          }

          const skuList = Array.from(incomingSkus);
          const existingSkus = new Set(
            (
              await Product.find(
                {
                  sellerId,
                  productSkuCode: { $in: skuList },
                },
                { productSkuCode: 1 }
              )
            ).map((p) => normalize(p.productSkuCode))
          );
          const { products } = await formatInventory(batch, sellerId);
          const filteredProducts = products.filter((p) => existingSkus.has(normalize(p.productSkuCode)));
          if (filteredProducts.length) {
            const bulkOps = filteredProducts.map((product) => ({
              updateOne: {
                filter: {
                  productSkuCode: product.productSkuCode,
                  sellerId: product.sellerId,
                },
                update: {
                  $set: {
                    currentStockCount: product.currentStockCount,
                    status: product.status,
                    productType: product.productType,
                    updatedAt: new Date(),
                  },
                },
              },
            }));

            const bulkResult = await Product.bulkWrite(bulkOps, {
              ordered: false,
            });

            updatedCount += bulkResult.matchedCount;

            console.log(
              `[Batch ${batchId}] Matched: ${bulkResult.matchedCount}, Modified: ${bulkResult.modifiedCount}`
            );
          }

          const endTime = Date.now();
          console.log(`[Batch ${batchId}] Complete — Duration: ${(endTime - startTime) / 1000}s`);

          return filteredProducts;
        } catch (err) {
          console.error(`[Batch ${batchId}] ERROR:`, err);
          throw err;
        }
      },
      BATCH_CONCURRENCY
    );

    // Update sync log
    await updateSyncDate(sellerId, 'INVENTORY', updatedCount);

    console.log(`\n[KIP Sync] COMPLETED — Total Processed Products: ${updatedCount}`);
  } catch (error) {
    console.error('Failed to sync Gürmen Group (KIP) products:', error);
    throw error;
  }
};
