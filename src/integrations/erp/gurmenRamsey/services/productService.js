import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { formatRamseyProduct } from '../helpers/formatter.js';
import { createGurmanRamseyAdapter } from '../ramseyAdapter.js';
const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

/**
 * Fetches Ramsey (Gürmen Group) products from ERP,
 * normalizes them, processes them in batches with concurrency,
 * and upserts them into MongoDB.
 */

export const getRamseyProducts = async (sellerId) => {
  try {
    const ramsey = createGurmanRamseyAdapter();
    const fetched = await ramsey.fetchProducts();
    if (!fetched || fetched.length === 0) {
      return { message: 'No Ramsey (Gürmen Group) products to sync.' };
    }
    console.log(`[Ramsey Sync] Started — Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);

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
          const { products, categoryTrails } = await formatRamseyProduct(batch, sellerId);

          /**
           * Convert products into canonical format
           * (unified schema used across all sellers).
           */
          const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

          console.log(`[Batch ${batchId}] Canonical Products: ${canonical.length}`);

          /**
           * Upsert canonical products into MongoDB using bulkWrite
           */
          if (canonical.length > 0) {
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
            console.log(`[Batch ${batchId}] Upserted Products: ${canonical.length}`);
          }

          /**
           * Insert category trails WITHOUT blocking the batch loop
           */
          if (categoryTrails && categoryTrails.size > 0) {
            console.log(`[Batch ${batchId}] Category Trails: ${categoryTrails.size} — inserting async`);
            insertCategoryTrail([...categoryTrails], sellerId).catch((err) =>
              console.error(`[Batch ${batchId}] Category Trail Insert Error:`, err)
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
    console.log(`\n[Ramsey Sync] ALL BATCHES COMPLETED SUCCESSFULLY`);
  } catch (error) {
    console.error('Failed to sync Ramsey products (Gürmen Group):', error);
    throw error;
  }
};
