import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import Product from '#root/src/models/Product.js';
import Price from '#root/src/models/Price.js';
import { createGurmanRamseyAdapter } from '../ramseyAdapter.js';
import { formatRamseyPrice } from '../helpers/formatPrice.js';
import { MIN_STOCK, MAX_PRICE } from '../constants/common.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => sku?.trim().toUpperCase();

export const ramseyPriceSync = async (sellerId) => {
  try {
    const adapter = createGurmanRamseyAdapter();
    const productsFromApi = await adapter.fetchProducts();

    if (!productsFromApi.length) {
      return { message: 'No Ramsey products found for price sync.' };
    }

    console.log(`[Ramsey Price Sync] Started`);

    let updatedCount = 0;

    await processInBatches(
      productsFromApi,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;
        console.log(`\n[Ramsey Price Sync Batch ${batchId}] Processing ${batch.length} items`);

        try {
          const skuSet = new Set();

          for (const p of batch) {
            const base = normalize(p.ws_code);
            if (!base) continue;

            skuSet.add(base);

            const subs = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

            const seenParents = new Set();

            for (const s of subs) {
              const color = normalize(s.color || s.color_drop) || 'DEFAULT';
              const size = normalize(s.size) || 'NOSIZE';

              const parentSku = `${base}-${color.replace(/\s+/g, '_')}`;

              if (!seenParents.has(parentSku)) {
                skuSet.add(parentSku);
                seenParents.add(parentSku);
              }

              skuSet.add(`${parentSku}-${size.replace(/\s+/g, '_')}`);
            }
          }

          const skuList = [...skuSet];

          const existingProducts = await Product.find(
            { sellerId, productSkuCode: { $in: skuList } },
            { _id: 1, productSkuCode: 1, currentStockCount: 1 }
          ).lean();

          const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));
          const existingSkus = new Set(productMap.keys());

          const { products } = formatRamseyPrice(batch, sellerId);

          const validProducts = products.filter((p) => existingSkus.has(normalize(p.productSkuCode)));

          if (!validProducts.length) return;

          const now = new Date();

          const productOps = validProducts.map((p) => {
            const prod = productMap.get(normalize(p.productSkuCode));
            const stockCount = prod?.currentStockCount ?? 0;
            const status = p.price >= MAX_PRICE || stockCount < MIN_STOCK ? 'inactive' : 'active';

            return {
              updateOne: {
                filter: { sellerId: p.sellerId, productSkuCode: p.productSkuCode },
                update: {
                  $set: {
                    price: p.price,
                    noonPrice: p.noonPrice,
                    namshiPrice: p.namshiPrice,
                    purchasePrice: p.purchasePrice,
                    msrp: p.msrp,
                    ...(p.minPrice !== null && { minPrice: p.minPrice }),
                    ...(p.maxPrice !== null && { maxPrice: p.maxPrice }),
                    status,
                    updatedAt: now,
                  },
                },
              },
            };
          });

          const priceOps = validProducts.map((p) => {
            const prod = productMap.get(normalize(p.productSkuCode));

            return {
              updateOne: {
                filter: { sellerId: p.sellerId, productSkuCode: p.productSkuCode },
                update: {
                  $set: {
                    price: p.price,
                    noonPrice: p.noonPrice,
                    namshiPrice: p.namshiPrice,
                    purchasePrice: p.purchasePrice,
                    msrp: p.msrp,
                    ...(p.minPrice !== null && { minPrice: p.minPrice }),
                    ...(p.maxPrice !== null && { maxPrice: p.maxPrice }),
                    updatedAt: now,
                    lastSyncedAt: now,
                  },
                  $setOnInsert: {
                    sellerId: p.sellerId,
                    productId: prod?._id || null,
                    productSkuCode: p.productSkuCode,
                    createdAt: now,
                  },
                },
                upsert: true,
              },
            };
          });

          const productResult = await Product.bulkWrite(productOps, { ordered: false });
          await Price.bulkWrite(priceOps, { ordered: false });

          updatedCount += productResult.matchedCount;

          console.log(
            `[Ramsey Price Sync Batch ${batchId}] Matched: ${productResult.matchedCount}, Modified: ${productResult.modifiedCount}`
          );
        } catch (err) {
          console.error(`[Ramsey Price Sync Batch ${batchId}] Error`, err);
          throw err;
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'PRICE', updatedCount);

    console.log(`[Ramsey Price Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Ramsey Price Sync] Failed:', error);
    throw error;
  }
};
