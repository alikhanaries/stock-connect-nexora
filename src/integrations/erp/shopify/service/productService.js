import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { formatProducts } from '#root/src/integrations/erp/shopify/helpers/formatter.js';
import { fetchProducts } from '#root/src/integrations/erp/shopify/service/shopifyService.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;

export const fetchAndStoreShopifyProducts = async (sellerId) => {
  try {
    const rawResponse = await fetchProducts();

    const rawProducts = rawResponse;

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      console.log('No products received from Shopify');
      return;
    }

    const canonicalProducts = await formatProducts(rawProducts, sellerId, MAX_BATCH_SIZE);

    if (!canonicalProducts.length) {
      console.log('No canonical products generated');
      return;
    }

    const categoryTrails = new Set();

    for (const product of canonicalProducts) {
      if (product.categoryTrail) {
        categoryTrails.add(product.categoryTrail);
      }
    }

    const bulkOps = canonicalProducts.map((product) => ({
      updateOne: {
        filter: {
          productSkuCode: product.productSkuCode,
          sellerId, //  safer
        },
        update: { $set: product },
        upsert: true,
      },
    }));

    const BULK_CHUNK_SIZE = 500;

    for (let i = 0; i < bulkOps.length; i += BULK_CHUNK_SIZE) {
      await Product.bulkWrite(bulkOps.slice(i, i + BULK_CHUNK_SIZE), { ordered: false });
    }

    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }
  } catch (err) {
    console.error('fetchAndStoreShopifyProducts error:', err);
  }
};
