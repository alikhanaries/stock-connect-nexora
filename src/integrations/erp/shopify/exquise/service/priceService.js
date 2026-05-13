import Product from '#root/src/models/Product.js';
import Price from '#root/src/models/Price.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { fetchExquiseProducts } from '../utils/fetch.js';
import { formatProducts } from '../helpers/formatter.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => sku?.trim().toUpperCase();

export const syncShopifyExquisePrice = async (sellerId, shopifyConfig) => {
  try {
    console.log('[Exquise Price Sync] Started');

    const rawProducts = await fetchExquiseProducts(shopifyConfig);

    if (!Array.isArray(rawProducts) || !rawProducts.length) {
      return { message: 'No products returned from Shopify' };
    }

    const canonicalProducts = await formatProducts(rawProducts, sellerId, MAX_BATCH_SIZE);

    if (!canonicalProducts.length) {
      return { message: 'No canonical products generated' };
    }

    let updatedCount = 0;

    await processInBatches(
      canonicalProducts,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;

        const skuList = batch.map((p) => normalize(p.productSkuCode));

        const existingProducts = await Product.find(
          { sellerId, productSkuCode: { $in: skuList } },
          { _id: 1, productSkuCode: 1 }
        ).lean();

        const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

        const now = new Date();
        const productOps = [];
        const priceOps = [];

        for (const p of batch) {
          const existing = productMap.get(normalize(p.productSkuCode));
          if (!existing) continue;

          productOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: p.productSkuCode },
              update: {
                $set: {
                  price: p.price,
                  noonPrice: p.noonPrice,
                  namshiPrice: p.namshiPrice,
                  purchasePrice: p.purchasePrice,
                  msrp: p.msrp,
                  updatedAt: now,
                },
              },
            },
          });

          priceOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: p.productSkuCode },
              update: {
                $set: {
                  price: p.price,
                  noonPrice: p.noonPrice,
                  namshiPrice: p.namshiPrice,
                  purchasePrice: p.purchasePrice,
                  msrp: p.msrp,
                  updatedAt: now,
                  lastSyncedAt: now,
                },
                $setOnInsert: {
                  sellerId,
                  productId: existing._id,
                  productSkuCode: p.productSkuCode,
                  createdAt: now,
                },
              },
              upsert: true,
            },
          });
        }

        if (productOps.length) {
          const result = await Product.bulkWrite(productOps, { ordered: false });
          await Price.bulkWrite(priceOps, { ordered: false });
          updatedCount += result.matchedCount;

          console.log(`[Exquise Price Sync][Batch ${batchId}] Updated: ${result.modifiedCount}`);
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'PRICE', updatedCount);
    console.log(`[Exquise Price Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Exquise Price Sync] Failed:', error);
    throw error;
  }
};
