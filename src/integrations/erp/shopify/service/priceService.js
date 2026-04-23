import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import Product from '#root/src/models/Product.js';
import Price from '#root/src/models/Price.js';
import { fetchProducts } from './shopifyService.js';
import { formatShopifyPrice } from '../helpers/formatPrice.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalize = (sku) =>
  String(sku || '')
    .trim()
    .toUpperCase();

export const shopifyPriceSync = async (sellerId, shopifyConfig) => {
  try {
    const rawProducts = await fetchProducts(shopifyConfig);

    if (!Array.isArray(rawProducts) || !rawProducts.length) {
      return { message: 'No Shopify products found for price sync.' };
    }

    console.log(`[Shopify Price Sync] Started — ${rawProducts.length} products`);

    let updatedCount = 0;

    await processInBatches(
      rawProducts,
      MAX_BATCH_SIZE,
      async (batch, index) => {
        const batchId = index + 1;
        console.log(`\n[Shopify Price Sync Batch ${batchId}] Processing ${batch.length} items`);

        try {
          const skuSet = new Set();

          for (const product of batch) {
            const { id, variants = [] } = product;
            if (!variants.length) continue;

            const grandParentSku = String(id);
            skuSet.add(grandParentSku);

            const groupedByColor = {};
            for (const v of variants) {
              const color = v.color || 'DEFAULT';
              if (!groupedByColor[color]) groupedByColor[color] = [];
              groupedByColor[color].push(v);
            }

            for (const [color, colorVariants] of Object.entries(groupedByColor)) {
              const safeColor = color.replace(/\s+/g, '_').toUpperCase();
              const parentSku = `${grandParentSku}-${safeColor}`;
              skuSet.add(parentSku);

              for (const v of colorVariants) {
                const size = v.size || '';
                const childSku =
                  v.sku ||
                  v.id ||
                  (size ? `${parentSku}-${size.replace(/\s+/g, '_').toUpperCase()}` : `${parentSku}-${v.id}`);
                skuSet.add(childSku);
              }
            }
          }

          const skuList = [...skuSet];

          const existingProducts = await Product.find(
            { sellerId, productSkuCode: { $in: skuList } },
            { _id: 1, productSkuCode: 1 }
          ).lean();

          const productMap = new Map(existingProducts.map((p) => [normalize(p.productSkuCode), p]));
          const existingSkus = new Set(productMap.keys());

          const { products } = formatShopifyPrice(batch, sellerId);

          const validProducts = products.filter((p) => existingSkus.has(normalize(p.productSkuCode)));

          if (!validProducts.length) return;

          const now = new Date();

          const productOps = validProducts.map((p) => ({
            updateOne: {
              filter: { sellerId: p.sellerId, productSkuCode: p.productSkuCode },
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
          }));

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
            `[Shopify Price Sync Batch ${batchId}] Matched: ${productResult.matchedCount}, Modified: ${productResult.modifiedCount}`
          );
        } catch (err) {
          console.error(`[Shopify Price Sync Batch ${batchId}] Error`, err);
          throw err;
        }
      },
      BATCH_CONCURRENCY
    );

    await updateSyncDate(sellerId, 'PRICE', updatedCount);

    console.log(`[Shopify Price Sync] Completed — Updated: ${updatedCount}`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('[Shopify Price Sync] Failed:', error);
    throw error;
  }
};
