import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createGurmanKipAdapter } from '../gurmanAdapter.js';
import { formatGurmanProduct } from '../helpers/formatter.js';
const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

/**
 * Fetches KIP (Gürmen Group) products from ERP,
 * normalizes them, processes them in batches with concurrency,
 * and upserts them into MongoDB.
 */

export const getGurmanProducts = async (sellerId, isImageUpdate) => {
  try {
    const gurman = createGurmanKipAdapter();
    const fetched = await gurman.fetchProducts();

    if (!fetched.length) {
      return { message: 'No Gürmen Group (KIP) products to sync.' };
    }
    console.log(`[KIP Sync] Started — Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);
    let upsertCount = 0;
    /**
     * processInBatches:
     * -----------------
     * - Splits product list into batches (MAX_BATCH_SIZE)
     * - Runs batches in parallel (up to BATCH_CONCURRENCY)
     * - Calls the callback for each batch
     */

    await processInBatches(
      fetched,
      MAX_BATCH_SIZE,
      async (batch, batchIndex) => {
        const batchId = batchIndex + 1;
        const startTime = Date.now();
        const incomingSkus = new Set();

        console.log(`\n[Batch ${batchId}] Started — Items: ${batch.length}`);
        try {
          /**
           * Collect incoming SKU codes
           */
          for (const p of batch) {
            const gp = p.ws_code || p.code;
            incomingSkus.add(gp);

            const subs = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

            for (const s of subs) {
              const color = (s.color || s.color_drop || '').trim() || 'DEFAULT';
              const size = (s.size || '').trim() || 'NOSIZE';

              incomingSkus.add(
                `${gp}-${color.replace(/\s+/g, '_').toUpperCase()}-${size.replace(/\s+/g, '_').toUpperCase()}`
              );
            }
          }

          /**
           * Fetch existing SKUs from DB
           */
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
            ).map((p) => p.productSkuCode)
          );

          /**
           * Format products
           */
          const { products, categoryTrails } = await formatGurmanProduct(batch, sellerId, isImageUpdate, existingSkus);
          /**
           * Convert products into canonical format
           * (unified schema used across all sellers).
           */
          const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

          console.log(`[Batch ${batchId}] Canonical Products: ${canonical.length}`);

          /**
           * Upsert canonical products into MongoDB using bulkWrite
           */
          if (canonical.length) {
            const bulkOps = canonical.map((product) => ({
              updateOne: {
                filter: {
                  productSkuCode: product.productSkuCode,
                  sellerId: product.sellerId,
                },
                update: { $set: product },
                upsert: true,
              },
            }));

            const data = await Product.bulkWrite(bulkOps, { ordered: false });
            upsertCount = calculateUpsertCount(upsertCount, data.upsertedCount);
          }
          /**
           * Insert category trails WITHOUT blocking the batch loop
           */
          if (categoryTrails && categoryTrails.size > 0) {
            insertCategoryTrail([...categoryTrails], sellerId).catch((err) =>
              console.error('Category insert (batch) failed:', err)
            );
          }
          const endTime = Date.now();
          console.log(`[Batch ${batchId}] Complete — Duration: ${(endTime - startTime) / 1000}s`);

          return canonical;
        } catch (err) {
          console.error(`[Batch ${batchId}] ERROR:`, err);
          throw err;
        }
      },
      // Number of batches to process in parallel
      BATCH_CONCURRENCY
    );
    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
    console.log(`\n[KIP Sync] ALL BATCHES COMPLETED SUCCESSFULLY`);
  } catch (error) {
    console.error('Failed to sync Gürmen Group (KIP) products:', error);
    throw error;
  }
};
