import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { formatProducts } from '../helpers/formatter.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { markMissingSkusRemoved } from '#root/src/helpers/ProductHierarchy.js';
import { fetchExquiseProducts } from '../utils/fetch.js';
import { skipZeroStockProducts } from '../helpers/skipZeroStockProducts.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;

export const fetchAndStoreShopifyExquiseProducts = async (sellerId, sellerData) => {
  try {
    const rawResponse = await fetchExquiseProducts(sellerData);

    let upsertCount = 0;
    // Product sync skips zero-stock products.
    const rawProducts = skipZeroStockProducts(rawResponse);

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
        update: {
          $set: {
            ...product,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    const BULK_CHUNK_SIZE = 500;

    for (let i = 0; i < bulkOps.length; i += BULK_CHUNK_SIZE) {
      const data = await Product.bulkWrite(bulkOps.slice(i, i + BULK_CHUNK_SIZE), { ordered: false });
      upsertCount = calculateUpsertCount(upsertCount, (data.upsertedCount || 0) + (data.modifiedCount || 0));
    }

    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }

    await markMissingSkusRemoved(
      sellerId,
      canonicalProducts.map((p) => p.productSkuCode)
    );

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
  } catch (err) {
    console.error('fetchAndStoreShopifyExquiseProducts error:', err);
  }
};
