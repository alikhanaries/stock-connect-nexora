import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import Product from '#root/src/models/Product.js';
import Inventory from '#root/src/models/Inventory.js';
import { createEliteStringLaIntimoAdapter } from '../eliteStringLaIntimoAdapter.js';
import { getProductStatus, getSellerNameById } from '#root/src/util/mapRowToInventory.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const getEliteStringLaIntimoStock = async (sellerId) => {
  try {
    let upsertCount = 0;
    const now = new Date();

    const adapter = createEliteStringLaIntimoAdapter();
    const products = await adapter.fetchProducts();

    const sellerName = await getSellerNameById(sellerId);

    const handleBatch = async (batch) => {
      const productBulkOps = [];
      const inventoryBulkOps = [];

      for (const product of batch) {
        const prodStatus = getProductStatus(sellerName, product.currentStockCount);

        // Product update operation
        productBulkOps.push({
          updateOne: {
            filter: {
              productSkuCode: product.productSkuCode,
              sellerId,
            },
            update: {
              $set: {
                ...product,
                sellerId,
                status: prodStatus,
                updatedAt: now,
              },
              $setOnInsert: {
                createdAt: now,
              },
            },
            upsert: true,
          },
        });

        // Inventory update operation
        inventoryBulkOps.push({
          updateOne: {
            filter: {
              sellerId,
              productSkuCode: product.productSkuCode,
            },
            update: {
              $set: {
                currentStockCount: product.currentStockCount,
                lastSyncedAt: now,
              },
              $setOnInsert: {
                sellerId,
                productSkuCode: product.productSkuCode,
                createdAt: now,
              },
            },
            upsert: true,
          },
        });
      }

      // Execute bulk writes
      const productResult = await Product.bulkWrite(productBulkOps, {
        ordered: false,
      });

      await Inventory.bulkWrite(inventoryBulkOps, {
        ordered: false,
      });

      upsertCount = calculateUpsertCount(upsertCount, productResult.upsertedCount);

      return true;
    };

    await processInBatches(products, MAX_BATCH_SIZE, handleBatch, BATCH_CONCURRENCY);

    await updateSyncDate(sellerId, 'INVENTORY', upsertCount);

    /**
     * TODO (Debugging): This log is intentionally kept for debugging purposes.
     * Do NOT remove at this stage.
     */
    console.log('Elite String La Intimo inventory sync completed successfully.');

    return true;
  } catch (error) {
    console.error('Elite String La Intimo stock update failed:', error);
    throw error;
  }
};
