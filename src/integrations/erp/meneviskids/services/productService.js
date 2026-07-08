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

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const getMeneviskidsProducts = async (sellerId, isImageUpdate) => {
  try {
    const seller = await Seller.findById(sellerId, { name: 1 }).lean();
    if (!seller?.name) throw new Error(`Seller ${sellerId} not found or missing name`);
    const sellerName = seller.name;
    const adapter = createMeneviskidsAdapter();
    const allProducts = await adapter.fetchProducts();

    // Filter products whose Brand matches the seller name (case-insensitive)
    const brandRegex = new RegExp(seller.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const fetched = allProducts.filter((p) => brandRegex.test((p.Brand || '').trim()));

    console.log(`[Menevis Kids Sync] Seller: "${seller.name}" — Total products in feed: ${allProducts.length}`);
    console.log(`[Menevis Kids Sync] Matched products for brand "${seller.name}": ${fetched.length}`);
    console.log(`[Menevis Kids Sync] Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);

    if (!fetched.length) {
      console.log(`[Menevis Kids Sync] No products found for brand "${seller.name}".`);
      return { message: `No products found matching brand "${seller.name}".` };
    }

    let upsertCount = 0;
    let totalProducts = 0;
    let totalGrandparents = 0;
    let totalParents = 0;

    await processInBatches(
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
              const { color } = extractSpecs(v.spec);
              const safeColor = color.replace(/\s+/g, '_').toUpperCase();
              incomingSkus.add(`${gp}-${safeColor}`);
              const childSku = (v.productCode || '').trim();
              if (childSku) incomingSkus.add(childSku);
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
            false,
            sellerName
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
            const bulkOps = canonical.map((product) => ({
              updateOne: {
                filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
                update: {
                  $set: { ...product, updatedAt: new Date() },
                  $setOnInsert: { createdAt: new Date() },
                },
                upsert: true,
              },
            }));

            try {
              const data = await Product.bulkWrite(bulkOps, { ordered: false });
              upsertCount = calculateUpsertCount(upsertCount, data.upsertedCount);
            } catch (bulkErr) {
              if (bulkErr?.writeErrors?.length) {
                console.error(`[Batch ${batchId}] bulkWrite had ${bulkErr.writeErrors.length} write errors. First 5:`);
                bulkErr.writeErrors.slice(0, 5).forEach((we) => {
                  const failedSku = bulkOps[we.index]?.updateOne?.filter?.productSkuCode;
                  console.error(`  SKU="${failedSku}" code=${we.code} msg=${we.errmsg}`);
                });
              } else {
                console.error(`[Batch ${batchId}] bulkWrite failed:`, bulkErr);
              }
              if (bulkErr?.result?.upsertedCount) {
                upsertCount = calculateUpsertCount(upsertCount, bulkErr.result.upsertedCount);
              }
            }
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
