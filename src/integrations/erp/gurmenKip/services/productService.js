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

        console.log(`\n[Batch ${batchId}] Started — Items: ${batch.length}`);
        try {
          /**
           * formatRamseyProduct:
           * ---------------------
           * - Formats product fields
           * - Extracts category trail hierarchy
           */
          const { products, categoryTrails } = await formatGurmanProduct(batch, sellerId, isImageUpdate);
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

            await Product.bulkWrite(bulkOps, { ordered: false });
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
    console.log(`\n[KIP Sync] ALL BATCHES COMPLETED SUCCESSFULLY`);
  } catch (error) {
    console.error('Failed to sync Gürmen Group (KIP) products:', error);
    throw error;
  }
};
