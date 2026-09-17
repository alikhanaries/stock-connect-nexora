import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { resolveHierarchyStatus, markMissingSkusRemoved } from '#root/src/helpers/ProductHierarchy.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { createCasabonyAdapter } from '../casabonyAdapter.js';
import { formatCasabonyProducts } from '../helpers/formatter.js';
import { filterInStockSubproducts } from '../helpers/filterInStockSubproducts.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const fetchAndStoreCasabonyProducts = async (sellerId, isImageUpdate = false) => {
  try {
    const adapter = createCasabonyAdapter();
    const rawResponse = await adapter.fetchProducts();

    const rawProducts = filterInStockSubproducts(rawResponse);

    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      console.log('[Casabony Product Sync] No products received from Casabony');
      return;
    }

    console.log(`[Casabony Sync] Started — Batch Size: ${MAX_BATCH_SIZE}, Concurrency: ${BATCH_CONCURRENCY}`);
    let upsertCount = 0;
    const allProcessedSkus = [];

    await processInBatches(
      rawProducts,
      MAX_BATCH_SIZE,
      async (batch, batchIndex) => {
        const batchId = batchIndex + 1;
        const startTime = Date.now();
        const incomingSkus = new Set();

        console.log(`\n[Batch ${batchId}] Started — Items: ${batch.length}`);

        try {
          for (const product of batch) {
            const grandParentSku = (product.OzelAlan1 || product.UrunKartiID || '').trim();
            if (!grandParentSku) continue;
            incomingSkus.add(grandParentSku);

            const subproducts = toArray(product?.UrunSecenek?.Secenek);
            const groupedByColor = subproducts.reduce((acc, sub) => {
              const ozellikler = toArray(sub?.EkSecenekOzellik?.Ozellik);
              const colorObj = ozellikler.find((o) => o.$?.Tanim === 'Renk');
              const color = (colorObj?._ || '').trim();
              (acc[color] ||= []).push(sub);
              return acc;
            }, {});

            for (const [color, variants] of Object.entries(groupedByColor)) {
              const safeColor = color ? color.replace(/\s+/g, '_').toUpperCase() : '';
              const parentSku = safeColor ? `${grandParentSku}-${safeColor}` : grandParentSku;
              incomingSkus.add(parentSku);

              for (const variant of variants) {
                const ozellikler = toArray(variant?.EkSecenekOzellik?.Ozellik);
                const sizeObj = ozellikler.find((o) => o.$?.Tanim === 'Beden');
                const size = (sizeObj?._ || '').trim();
                const safeSize = size ? size.replace(/\s+/g, '_').toUpperCase() : '';
                const childSku = (variant.StokKodu || (safeSize ? `${parentSku}-${safeSize}` : parentSku)).trim();
                incomingSkus.add(childSku);
              }
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

          const { products: formattedProducts, categoryTrails } = await formatCasabonyProducts(
            batch,
            sellerId,
            isImageUpdate,
            existingSkus
          );

          const canonical = formattedProducts.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

          console.log(`[Batch ${batchId}] Canonical Products: ${canonical.length}`);

          if (canonical.length) {
            canonical.forEach((p) => allProcessedSkus.push(p.productSkuCode));

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
              upsertCount = calculateUpsertCount(upsertCount, (data.upsertedCount || 0) + (data.modifiedCount || 0));
            } catch (bulkErr) {
              if (bulkErr?.writeErrors?.length) {
                console.error(`[Batch ${batchId}] bulkWrite had ${bulkErr.writeErrors.length} write errors.`);
              } else {
                console.error(`[Batch ${batchId}] bulkWrite failed:`, bulkErr);
              }
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

    if (allProcessedSkus.length > 0) {
      await resolveHierarchyStatus(sellerId, allProcessedSkus);
      await markMissingSkusRemoved(sellerId, allProcessedSkus);
    }

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
    console.log(`[Casabony Sync] ALL BATCHES COMPLETED SUCCESSFULLY. Upserted count: ${upsertCount}`);
  } catch (err) {
    console.error('[Casabony Product Sync] fetchAndStoreCasabonyProducts error:', err);
  }
};
