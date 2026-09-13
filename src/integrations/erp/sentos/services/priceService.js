import Product from '#models/Product.js';
import Price from '#models/Price.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { formatSentosPriceRows } from '../helpers/formatPrice.js';
import { fetchSentosProductsPage } from './productService.js';
import { SENTOS_DEFAULT_PAGE_SIZE } from '../constants/common.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalizeSku = (sku) =>
  String(sku || '')
    .trim()
    .toUpperCase();

export const sentosPriceSync = async (sellerId) => {
  let page = 1;
  let updatedCount = 0;

  while (true) {
    const response = await fetchSentosProductsPage(page, SENTOS_DEFAULT_PAGE_SIZE);
    const list = Array.isArray(response?.data) ? response.data : [];
    if (!list.length) break;

    await processInBatches(
      list,
      MAX_BATCH_SIZE,
      async (batch) => {
        const { products } = await formatSentosPriceRows(batch, sellerId);
        if (!products.length) return;

        const skuList = products.map((p) => p.productSkuCode);
        const existingProducts = await Product.find(
          { sellerId, productSkuCode: { $in: skuList } },
          { _id: 1, productSkuCode: 1 }
        ).lean();

        const productMap = new Map(existingProducts.map((p) => [normalizeSku(p.productSkuCode), p]));
        const now = new Date();
        const productOps = [];
        const priceOps = [];

        for (const row of products) {
          const existing = productMap.get(normalizeSku(row.productSkuCode));
          if (!existing) continue;

          productOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: row.productSkuCode },
              update: {
                $set: {
                  price: row.price,
                  noonPrice: row.noonPrice,
                  namshiPrice: row.namshiPrice,
                  amazonPrice: row.amazonPrice,
                  purchasePrice: row.purchasePrice,
                  msrp: row.msrp,
                  ...(row.minPrice !== null && { minPrice: row.minPrice }),
                  ...(row.maxPrice !== null && { maxPrice: row.maxPrice }),
                  updatedAt: now,
                },
              },
            },
          });

          priceOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: row.productSkuCode },
              update: {
                $set: {
                  price: row.price,
                  noonPrice: row.noonPrice,
                  namshiPrice: row.namshiPrice,
                  amazonPrice: row.amazonPrice,
                  purchasePrice: row.purchasePrice,
                  msrp: row.msrp,
                  ...(row.minPrice !== null && { minPrice: row.minPrice }),
                  ...(row.maxPrice !== null && { maxPrice: row.maxPrice }),
                  updatedAt: now,
                  lastSyncedAt: now,
                },
                $setOnInsert: {
                  sellerId,
                  productId: existing._id,
                  productSkuCode: row.productSkuCode,
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
          updatedCount += result.modifiedCount;
        }
      },
      BATCH_CONCURRENCY
    );

    const totalPages = Number(response?.total_pages) || page;
    if (page >= totalPages) break;
    page++;
  }

  await updateSyncDate(sellerId, 'PRICE', updatedCount);

  return { success: true, updatedCount };
};
