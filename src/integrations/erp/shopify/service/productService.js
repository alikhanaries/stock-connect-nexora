import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { formatProducts } from '#root/src/integrations/erp/shopify/helpers/formatter.js';
import { fetchProducts } from '#root/src/integrations/erp/shopify/service/shopifyService.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { updateSyncJob } from '#root/src/helpers/syncProgress.js';
import { filterValidHierarchyProducts } from '#root/src/helpers/ProductHierarchy.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;

export const fetchAndStoreShopifyProducts = async (sellerId, sellerData) => {
  try {
    const rawResponse = await fetchProducts(sellerData);

    let upsertCount = 0;
    let insertedCount = 0;
    let modifiedCount = 0;
    const rawProducts = rawResponse;

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      console.log('No products received from Shopify');
      return { success: true, updatedCount: 0, message: 'No products received from Shopify' };
    }

    const rawCanonicalProducts = await formatProducts(rawProducts, sellerId, MAX_BATCH_SIZE);

    if (!rawCanonicalProducts.length) {
      console.log('No canonical products generated');
      return { success: true, updatedCount: 0, message: 'No canonical products generated' };
    }

    const existingSkus = new Set(
      (
        await Product.find(
          { sellerId, productSkuCode: { $in: rawCanonicalProducts.map((p) => p.productSkuCode) } },
          { productSkuCode: 1 }
        )
      ).map((p) => p.productSkuCode)
    );

    // Stock drives status: in stock -> active, unless the merchant archived it
    // in Shopify (mapped to 'removed' already) - left alone so restocking it
    // doesn't un-archive it. The 0-stock side (drop if brand-new, mark
    // 'inactive' if it already existed) is handled by the filter below.
    for (const product of rawCanonicalProducts) {
      if (product.status === 'removed') continue;
      if ((Number(product.currentStockCount) || 0) > 0) {
        product.status = 'active';
      }
    }

    const canonicalProducts = filterValidHierarchyProducts(rawCanonicalProducts, {
      requirePriceAndImage: true,
      existingSkus,
    });

    if (!canonicalProducts.length) {
      console.log('No sellable canonical products after filtering');
      return { success: true, updatedCount: 0, message: 'No sellable canonical products after filtering' };
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
    const totalOps = bulkOps.length;
    let processedOps = 0;

    for (let i = 0; i < bulkOps.length; i += BULK_CHUNK_SIZE) {
      const data = await Product.bulkWrite(bulkOps.slice(i, i + BULK_CHUNK_SIZE), { ordered: false });
      insertedCount = calculateUpsertCount(insertedCount, data.upsertedCount);
      modifiedCount = calculateUpsertCount(modifiedCount, data.modifiedCount);
      upsertCount = calculateUpsertCount(upsertCount, (data.upsertedCount || 0) + (data.modifiedCount || 0));

      processedOps += Math.min(BULK_CHUNK_SIZE, bulkOps.length - i);
      updateSyncJob(sellerId, { completed: processedOps, total: totalOps });
    }

    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }

    // Anything previously active for this seller's Shopify feed that isn't in
    // today's fetch at all (as opposed to being fetched with 0 stock, which
    // stays 'inactive' via the filter above) gets marked removed.
    const feedSkuCodes = canonicalProducts.map((product) => product.productSkuCode);
    await Product.updateMany(
      {
        sellerId,
        source: 'SHOPIFY',
        status: { $ne: 'removed' },
        productSkuCode: { $nin: feedSkuCodes },
      },
      { $set: { status: 'removed', currentStockCount: 0, updatedAt: new Date() } }
    );

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);

    return { success: true, updatedCount: upsertCount, insertedCount, modifiedCount };
  } catch (err) {
    console.error('fetchAndStoreShopifyProducts error:', err);
    throw err;
  }
};
