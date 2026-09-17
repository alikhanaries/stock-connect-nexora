import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import Product from '#root/src/models/Product.js';
import Seller from '#root/src/models/Seller.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createMeneviskidsAdapter } from '../meneviskidsAdapter.js';
import { formatMeneviskidsProduct, toArray, extractSpecs } from '../helpers/formatter.js';
import { markMissingSkusRemoved } from '#root/src/helpers/ProductHierarchy.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const buildBulkOps = (products) =>
  products.map((product) => ({
    updateOne: {
      filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
      update: {
        $set: { ...product, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }));

const runBulkWrite = async (bulkOps, batchId, label) => {
  if (!bulkOps.length) return { upsertedCount: 0, writtenSkus: new Set() };

  try {
    const data = await Product.bulkWrite(bulkOps, { ordered: false });
    return {
      upsertedCount: data.upsertedCount || 0,
      writtenSkus: new Set(bulkOps.map((op) => op.updateOne.filter.productSkuCode)),
    };
  } catch (bulkErr) {
    if (bulkErr?.writeErrors?.length) {
      console.error(`[Batch ${batchId}] ${label} bulkWrite had ${bulkErr.writeErrors.length} write errors. First 5:`);
      bulkErr.writeErrors.slice(0, 5).forEach((we) => {
        const failedSku = bulkOps[we.index]?.updateOne?.filter?.productSkuCode;
        console.error(`  SKU="${failedSku}" code=${we.code} msg=${we.errmsg}`);
      });
    } else {
      console.error(`[Batch ${batchId}] ${label} bulkWrite failed:`, bulkErr);
    }

    const failedIndexes = new Set((bulkErr?.writeErrors || []).map((we) => we.index));
    const writtenSkus = new Set(
      bulkOps.filter((_, index) => !failedIndexes.has(index)).map((op) => op.updateOne.filter.productSkuCode)
    );

    return {
      upsertedCount: bulkErr?.result?.upsertedCount || 0,
      writtenSkus,
    };
  }
};

const upsertHierarchyProducts = async (products, batchId, sellerId) => {
  const skuList = products.map((p) => p.productSkuCode);
  const conflicts = await Product.find(
    { productSkuCode: { $in: skuList }, sellerId: { $ne: sellerId } },
    { productSkuCode: 1 }
  ).lean();
  const conflictSkus = new Set(conflicts.map((p) => p.productSkuCode));

  if (conflictSkus.size) {
    console.warn(
      `[Batch ${batchId}] ${conflictSkus.size} SKU(s) already owned by another seller (global SKU index). First 5:`,
      [...conflictSkus].slice(0, 5)
    );
  }

  const grandparents = products.filter((p) => !p.parentProductSkuCode && !p.grandParentProductSkuCode);
  const parents = products.filter((p) => p.grandParentProductSkuCode && !p.parentProductSkuCode);
  const children = products.filter((p) => p.parentProductSkuCode);

  let upsertedCount = 0;

  const gpResult = await runBulkWrite(buildBulkOps(grandparents), batchId, 'grandparent');
  upsertedCount += gpResult.upsertedCount;

  const parentResult = await runBulkWrite(buildBulkOps(parents), batchId, 'parent');
  upsertedCount += parentResult.upsertedCount;

  const savedParents = new Set(
    (
      await Product.find(
        { sellerId, productSkuCode: { $in: parents.map((p) => p.productSkuCode) } },
        { productSkuCode: 1 }
      ).lean()
    ).map((p) => p.productSkuCode)
  );

  const validChildren = children.filter((p) => savedParents.has(p.parentProductSkuCode));
  const skippedChildren = children.length - validChildren.length;
  if (skippedChildren) {
    console.warn(
      `[Batch ${batchId}] Skipped ${skippedChildren} variant(s) because parent row is missing for this seller (often a global SKU conflict).`
    );
  }

  const childResult = await runBulkWrite(buildBulkOps(validChildren), batchId, 'child');
  upsertedCount += childResult.upsertedCount;

  return upsertedCount;
};

export const getMeneviskidsProducts = async (sellerId, isImageUpdate) => {
  try {
    const seller = await Seller.findById(sellerId, { name: 1 }).lean();
    if (!seller?.name) throw new Error(`Seller ${sellerId} not found or missing name`);
    const adapter = createMeneviskidsAdapter();
    const allProducts = await adapter.fetchProducts();
    const fetched = allProducts;

    console.log(`[Menevis Kids Sync] Seller: "${seller.name}" — Total products in feed: ${allProducts.length}`);
    console.log(`[Menevis Kids Sync] Products queued for import: ${fetched.length}`);
    console.log(`[Menevis Kids Sync] Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);

    if (!fetched.length) {
      console.log(`[Menevis Kids Sync] No products found in XML feed.`);
      return { message: 'No products found in Menevis Kids XML feed.' };
    }

    let upsertCount = 0;
    let totalProducts = 0;
    let totalGrandparents = 0;
    let totalParents = 0;

    const allCanonical = await processInBatches(
      fetched,
      MAX_BATCH_SIZE,
      async (batch, batchIndex) => {
        const batchId = batchIndex + 1;
        const startTime = Date.now();
        const incomingSkus = new Set();

        console.log(`\n[Batch ${batchId}] Started — Items: ${batch.length}`);

        try {
          for (const p of batch) {
            const gp = (p.Product_code || '').trim();
            if (!gp) continue;

            const variants = toArray(p?.variants?.variant);
            const validVariants = variants.filter((v) => {
              const { color, size } = extractSpecs(v.spec);
              return color && size && (v.productCode || '').trim();
            });

            if (!validVariants.length) continue;

            incomingSkus.add(gp);

            for (const v of validVariants) {
              const { color, size } = extractSpecs(v.spec);
              const safeColor = color.replace(/\s+/g, '_').toUpperCase();
              const parentSku = `${gp}-${safeColor}`;
              incomingSkus.add(parentSku);
              if (size) incomingSkus.add(`${parentSku}-${size.trim()}`);
            }
          }

          const skuList = Array.from(incomingSkus);

          const existingSkus = new Set(
            (await Product.find({ sellerId, productSkuCode: { $in: skuList } }, { productSkuCode: 1 })).map(
              (p) => p.productSkuCode
            )
          );

          const { products, categoryTrails } = await formatMeneviskidsProduct(
            batch,
            sellerId,
            isImageUpdate,
            existingSkus,
            true,
            seller.name
          );

          const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

          totalProducts += canonical.length;
          totalGrandparents += canonical.filter(
            (p) => p.productType === 'configurable' && !p.grandParentProductSkuCode
          ).length;
          totalParents += canonical.filter(
            (p) => p.productType === 'configurable' && !!p.grandParentProductSkuCode
          ).length;

          console.log(`[Batch ${batchId}] Canonical Products: ${canonical.length}`);

          if (canonical.length) {
            upsertCount = calculateUpsertCount(
              upsertCount,
              await upsertHierarchyProducts(canonical, batchId, sellerId)
            );
          }

          if (categoryTrails?.length > 0) {
            insertCategoryTrail(categoryTrails, sellerId).catch((err) =>
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
      BATCH_CONCURRENCY
    );

    const feedSkuCodes = allCanonical.filter(Boolean).map((p) => p.productSkuCode);
    if (feedSkuCodes.length > 0) {
      await markMissingSkusRemoved(sellerId, feedSkuCodes);
    }

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
    console.log('\n[Menevis Kids Sync] ALL BATCHES COMPLETED SUCCESSFULLY');
    console.log(
      `[Menevis Kids Sync] Total Products: ${totalProducts} | Grandparents: ${totalGrandparents} | Parents: ${totalParents} | Variants: ${totalProducts - totalGrandparents - totalParents}`
    );
  } catch (error) {
    console.error('Failed to sync Menevis Kids products:', error);
    throw error;
  }
};
