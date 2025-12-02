import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createGurmanKipAdapter } from '../gurmanAdapter.js';
import { formatGurmanProduct } from '../helpers/formatter.js';
const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const getGurmanProducts = async (sellerId) => {
  try {
    const gurman = createGurmanKipAdapter();
    const fetched = await gurman.fetchProducts();

    if (!fetched.length) {
      return { message: 'No Gürmen Group (KIP) products to sync.' };
    }
    await processInBatches(
      fetched,
      MAX_BATCH_SIZE,
      async (batch) => {
        const { products, categoryTrails } = await formatGurmanProduct(batch, sellerId);
        const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);
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
        if (categoryTrails && categoryTrails.size > 0) {
          insertCategoryTrail([...categoryTrails], sellerId).catch((err) =>
            console.error('Category insert (batch) failed:', err)
          );
        }
        return canonical;
      },
      BATCH_CONCURRENCY
    );
  } catch (error) {
    console.error('Failed to sync Gürmen Group (KIP) products:', error);
    throw error;
  }
};
