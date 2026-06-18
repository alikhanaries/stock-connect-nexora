import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import Product from '#root/src/models/Product.js';
import Seller from '#root/src/models/Seller.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createMeneviskidsAdapter } from '../meneviskidsAdapter.js';
import { formatMeneviskidsProduct } from '../helpers/formatter.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const toArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const extractSpecs = (specs) => {
  const specArray = toArray(specs);
  const colorSpec = specArray.find((s) => s?.['$']?.name === 'renk');
  const sizeSpec = specArray.find((s) => s?.['$']?.name === 'beden');
  return {
    color: (colorSpec?.['_'] || '').trim(),
    size: (sizeSpec?.['_'] || '').trim(),
  };
};

export const getMeneviskidsProducts = async (sellerId, isImageUpdate) => {
  try {
    const seller = await Seller.findById(sellerId, { name: 1 }).lean();
    if (!seller?.name) throw new Error(`Seller ${sellerId} not found or missing name`);

    const adapter = createMeneviskidsAdapter();
    const allProducts = await adapter.fetchProducts();

    // Filter products whose Brand matches the seller name (case-insensitive)
    const brandRegex = new RegExp(seller.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const fetched = allProducts.filter((p) => brandRegex.test((p.Brand || '').trim()));

    if (!fetched.length) {
      return { message: `No products found matching brand "${seller.name}".` };
    }

    let upsertCount = 0;

    await processInBatches(
      fetched,
      MAX_BATCH_SIZE,
      async (batch, batchIndex) => {
        const batchId = batchIndex + 1;

        const incomingSkus = new Set();

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
            existingSkus
          );

          const canonical = products.map((p) => canonicalProductMapper(p, sellerId)).filter(Boolean);

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

          return canonical;
        } catch (err) {
          console.error(`[Batch ${batchId}] ERROR:`, err);
          throw err;
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
  } catch (error) {
    console.error('Failed to sync Menevis Kids products:', error);
    throw error;
  }
};
