import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import Product from '#root/src/models/Product.js';
import { createElliteStringAdapter } from '../elliteStringAdapter.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const getElliteStringStock = async (sellerId) => {
  try {
    const adapter = createElliteStringAdapter();
    const products = await adapter.fetchProducts();
    const handleBatch = async (batch) => {
      const bulkOps = batch.map((product) => ({
        updateOne: {
          filter: { productSkuCode: product.productSkuCode, sellerId },
          update: { $set: { ...product, sellerId } },
          upsert: true,
        },
      }));

      await Product.bulkWrite(bulkOps, { ordered: false });
      return true;
    };
    await processInBatches(products, MAX_BATCH_SIZE, handleBatch, BATCH_CONCURRENCY);
    /**
     * TODO (Debugging): This log is intentionally kept for debugging purposes.
     * Do NOT remove at this stage.
     */
    console.log('ElliteString stock sync completed successfully.');

    return true;
  } catch (error) {
    console.error('ElliteString stock update failed:', error);
    throw error;
  }
};
