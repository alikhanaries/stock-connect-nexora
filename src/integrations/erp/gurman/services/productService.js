import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { uploadProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createGurmanAdapter } from '../gurmanAdapter.js';
import { formatGurmanProduct } from '../helpers/formatter.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;

export const getGurmanProducts = async (sellerId) => {
  try {
    const gurman = createGurmanAdapter();
    const products = await gurman.fetchProducts();
    if (products.length === 0) {
      return { message: 'No products to sync.' };
    }
    const categoryTrails = new Set();
    await processInBatches(products, MAX_BATCH_SIZE, async (batch) => {
      const formattedProducts = await formatGurmanProduct(batch, sellerId);
      const uploadedProducts = await Promise.all(formattedProducts.map((p) => uploadProductImages(p, sellerId)));
      const canonicalProducts = uploadedProducts.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

      for (const product of canonicalProducts) {
        if (product.categoryTrail) categoryTrails.add(product.categoryTrail);
      }

      if (canonicalProducts.length > 0) {
        const bulkOps = canonicalProducts.map((product) => ({
          updateOne: {
            filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
            update: { $set: product },
            upsert: true,
          },
        }));
        await Product.bulkWrite(bulkOps, { ordered: false });
      }
    });

    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }
  } catch (error) {
    console.error(`Failed to get Gurman products:`, error);
    throw error;
  }
};
