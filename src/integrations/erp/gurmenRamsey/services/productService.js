import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { uploadProductImages } from '#root/src/integrations/common/helpers/uploadProductImages.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createRamseyAdapter } from '../ramseyAdapter.js';
import { formatRamseyProduct } from '../helpers/formatter.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;

export const getRamseyProducts = async (sellerId) => {
  try {
    const ramsey = createRamseyAdapter();
    const products = await ramsey.fetchProducts();
    if (!products || products.length === 0) {
      return { message: 'No Ramsey (Gürmen Group) products to sync.' };
    }
    const categoryTrails = new Set();
    await processInBatches(products, MAX_BATCH_SIZE, async (batch, batchIndex) => {
      try {
        const formattedProducts = await formatRamseyProduct(batch, sellerId);
        const uploadedProducts = await Promise.all(
          formattedProducts.map(async (p) => {
            try {
              return await uploadProductImages(p, sellerId);
            } catch (imgErr) {
              console.error(`Image upload failed for product SKU ${p?.productSkuCode || 'UNKNOWN'}:`, imgErr);
              return null;
            }
          })
        );
        const canonicalProducts = uploadedProducts
          .filter(Boolean)
          .map((p) => canonicalProductMapper(p, sellerId))
          .filter(Boolean);
        for (const product of canonicalProducts) {
          if (product.categoryTrail) categoryTrails.add(product.categoryTrail);
        }
        if (canonicalProducts.length > 0) {
          const bulkOps = canonicalProducts.map((product) => ({
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
      } catch (innerError) {
        console.error(`Ramsey (Gürmen Group) batch processing failed (batch index ${batchIndex}):`, innerError);
      }
    });
    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }
  } catch (error) {
    console.error('Failed to sync Ramsey products (Gürmen Group):', error);
    throw error;
  }
};
