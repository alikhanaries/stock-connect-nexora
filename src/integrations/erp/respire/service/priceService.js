import Product from '#models/Product.js';
import Price from '#root/src/models/Price.js';

import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';

import { getAccessToken } from '../utils/accessTokenGenerator.js';
import { fetchProductsPage } from './productService.js';
import { formatRespirePrice } from '../helpers/formatPrice.js';
import { convertCodeFormat } from '../helpers/commonHelper.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) => convertCodeFormat(sku)?.trim().toUpperCase();

export const respirePriceSync = async (sellerId) => {
  try {
    console.log('[Respire Price Sync] Started');

    const AUTH_TOKEN = await getAccessToken();

    let page = 1;
    let updatedCount = 0;

    while (true) {
      const response = await fetchProductsPage(page, AUTH_TOKEN);

      const list = response?.productList;

      if (!Array.isArray(list) || !list.length) {
        console.log('[Respire Price Sync] No more pages.');
        break;
      }

      await processInBatches(
        list,
        MAX_BATCH_SIZE,
        async (batch, index) => {
          const batchId = index + 1;
          console.log(`\n[Respire Price Sync Batch ${batchId}] Processing ${batch.length} products`);

          const { products } = await formatRespirePrice(batch, sellerId);

          if (!products.length) return;

          const skuList = products.map((p) => normalize(p.productSkuCode));

          const existingProducts = await Product.find(
            { sellerId, productSkuCode: { $in: skuList } },
            { _id: 1, productSkuCode: 1 }
          ).lean();

          const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));

          const now = new Date();

          const productOps = [];
          const priceOps = [];

          for (const p of products) {
            const existing = productMap.get(normalize(p.productSkuCode));
            if (!existing) continue;

            productOps.push({
              updateOne: {
                filter: { sellerId: p.sellerId, productSkuCode: p.productSkuCode },
                update: {
                  $set: {
                    price: p.price,
                    noonPrice: p.noonPrice,
                    namshiPrice: p.namshiPrice,
                    amazonPrice: p.amazonPrice,
                    sixthStreetPrice: p.sixthStreetPrice,
                    styliPrice: p.styliPrice,
                    purchasePrice: p.purchasePrice,
                    msrp: p.msrp,
                    ...(p.minPrice !== null && { minPrice: p.minPrice }),
                    ...(p.maxPrice !== null && { maxPrice: p.maxPrice }),
                    updatedAt: now,
                  },
                },
              },
            });

            priceOps.push({
              updateOne: {
                filter: { sellerId: p.sellerId, productSkuCode: p.productSkuCode },
                update: {
                  $set: {
                    price: p.price,
                    noonPrice: p.noonPrice,
                    namshiPrice: p.namshiPrice,
                    amazonPrice: p.amazonPrice,
                    sixthStreetPrice: p.sixthStreetPrice,
                    styliPrice: p.styliPrice,
                    purchasePrice: p.purchasePrice,
                    msrp: p.msrp,
                    ...(p.minPrice !== null && { minPrice: p.minPrice }),
                    ...(p.maxPrice !== null && { maxPrice: p.maxPrice }),
                    updatedAt: now,
                    lastSyncedAt: now,
                  },
                  $setOnInsert: {
                    sellerId: p.sellerId,
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

            console.log(
              `[Respire Price Sync Batch ${batchId}] Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`
            );
          }
        },
        BATCH_CONCURRENCY
      );

      page++;
    }

    await updateSyncDate(sellerId, 'PRICE', updatedCount);

    console.log(`[Respire Price Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Respire Price Sync] Failed:', error);
    throw error;
  }
};
