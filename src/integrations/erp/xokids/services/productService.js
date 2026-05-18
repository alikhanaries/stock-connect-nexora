import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { filterInStockSubproducts } from '#root/src/integrations/common/helpers/filterInStockSubproducts.js';
import Product from '#root/src/models/Product.js';
import Seller from '#root/src/models/Seller.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createXokidsAdapter } from '../xokidsAdapter.js';
import { getMappingBySellerSlug } from '../helpers/brandMapping.js';
import { formatXokidsProduct } from '../helpers/formatter.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const getXokidsProducts = async (sellerId, isImageUpdate) => {
  try {
    const seller = await Seller.findById(sellerId, { slug: 1 }).lean();
    if (!seller?.slug) throw new Error(`Seller ${sellerId} not found or missing slug`);

    const mapping = getMappingBySellerSlug(seller.slug);
    if (!mapping) throw new Error(`Seller slug "${seller.slug}" is not a supported brand`);
    const { displayBrand } = mapping;

    const adapter = createXokidsAdapter();
    const productsFromApi = await adapter.fetchProducts(seller.slug);
    const fetched = filterInStockSubproducts(productsFromApi);

    if (!fetched.length) {
      return { message: `No ${displayBrand} products to sync.` };
    }

    console.log(`[${displayBrand} Sync] Started — Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);
    let upsertCount = 0;

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
            const gp = p.ws_code || p.code;
            const subs = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

            // Only consider subproducts with BOTH color (type1) and size (type2)
            const validSubs = subs.filter((s) => (s.type1 || '').trim() && (s.type2 || '').trim());

            // Skip entire product if no valid subproducts
            if (!validSubs.length) continue;

            incomingSkus.add(gp);

            for (const s of validSubs) {
              const color = (s.type1 || '').trim();
              const size = (s.type2 || '').trim();

              incomingSkus.add(
                `${gp}-${color.replace(/\s+/g, '_').toUpperCase()}-${size.replace(/\s+/g, '_').toUpperCase()}`
              );
            }
          }

          const skuList = Array.from(incomingSkus);

          const existingSkus = new Set(
            (
              await Product.find(
                {
                  sellerId,
                  productSkuCode: { $in: skuList },
                },
                { productSkuCode: 1 }
              )
            ).map((p) => p.productSkuCode)
          );

          const { products, categoryTrails } = await formatXokidsProduct(batch, sellerId, isImageUpdate, existingSkus);

          const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

          console.log(`[Batch ${batchId}] Canonical Products: ${canonical.length}`);

          if (canonical.length) {
            const bulkOps = canonical.map((product) => ({
              updateOne: {
                filter: {
                  productSkuCode: product.productSkuCode,
                  sellerId: product.sellerId,
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

            try {
              const data = await Product.bulkWrite(bulkOps, { ordered: false });
              upsertCount = calculateUpsertCount(upsertCount, data.upsertedCount);
            } catch (bulkErr) {
              // Log write errors so we can see which SKUs failed
              if (bulkErr?.writeErrors?.length) {
                console.error(`[Batch ${batchId}] bulkWrite had ${bulkErr.writeErrors.length} write errors. First 5:`);
                bulkErr.writeErrors.slice(0, 5).forEach((we) => {
                  const failedSku = bulkOps[we.index]?.updateOne?.filter?.productSkuCode;
                  console.error(`  SKU="${failedSku}" code=${we.code} msg=${we.errmsg}`);
                });
              } else {
                console.error(`[Batch ${batchId}] bulkWrite failed:`, bulkErr);
              }
              // Still record partial upserts from the error result
              if (bulkErr?.result?.upsertedCount) {
                upsertCount = calculateUpsertCount(upsertCount, bulkErr.result.upsertedCount);
              }
            }
          }

          if (categoryTrails && categoryTrails.length > 0) {
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
    console.log(`\n[${displayBrand} Sync] ALL BATCHES COMPLETED SUCCESSFULLY`);
  } catch (error) {
    console.error('Failed to sync products:', error);
    throw error;
  }
};
