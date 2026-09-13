import Product from '#models/Product.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { canonicalProductMapper } from '#root/src/integrations/common/helpers/canonicalProductMapper.js';
import { calculateUpsertCount } from '#root/src/integrations/common/helpers/calculateUpsertCount.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { sentosFetch } from '../utils/fetch.js';
import { fetchSentosCategories } from './categoryService.js';
import { formatSentosProducts } from '../helpers/formatter.js';
import { SENTOS_DEFAULT_PAGE_SIZE, SENTOS_FETCH_DELAY_MS } from '../constants/common.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const fetchSentosProductsPage = async (page = 1, size = SENTOS_DEFAULT_PAGE_SIZE) => {
  const query = new URLSearchParams({
    page: String(page),
    size: String(size),
    orderby_id: 'ASC',
  });

  await new Promise((resolve) => setTimeout(resolve, SENTOS_FETCH_DELAY_MS));
  return sentosFetch(`products?${query.toString()}`, { method: 'GET' });
};

export const deactivateSentosProducts = async (sellerId, skuCodes = []) => {
  if (!skuCodes.length) return;

  await Product.updateMany(
    {
      sellerId,
      $or: [{ productSkuCode: { $in: skuCodes } }, { parentProductSkuCode: { $in: skuCodes } }],
    },
    {
      $set: {
        status: 'inactive',
        currentStockCount: 0,
        updatedAt: new Date(),
      },
    }
  );
};

export const importAllSentosProducts = async (sellerId) => {
  const categoryMap = await fetchSentosCategories();
  let page = 1;
  let upsertCount = 0;
  const deactivateSkus = new Set();

  while (true) {
    const response = await fetchSentosProductsPage(page);
    const list = Array.isArray(response?.data) ? response.data : [];

    if (!list.length) break;

    const { products, parentsToDeactivate } = await formatSentosProducts(list, sellerId, categoryMap);
    parentsToDeactivate.forEach((sku) => deactivateSkus.add(sku));

    if (products.length) {
      await processInBatches(
        products,
        MAX_BATCH_SIZE,
        async (batch) => {
          const canonical = batch.map((item) => canonicalProductMapper(item, sellerId)).filter(Boolean);

          if (!canonical.length) return;

          const bulkOps = canonical.map((product) => ({
            updateOne: {
              filter: {
                sellerId: product.sellerId,
                productSkuCode: product.productSkuCode,
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

          const result = await Product.bulkWrite(bulkOps, { ordered: false });
          upsertCount = calculateUpsertCount(upsertCount, result.upsertedCount + result.modifiedCount);
        },
        BATCH_CONCURRENCY
      );
    }

    const totalPages = Number(response?.total_pages) || page;
    if (page >= totalPages) break;
    page++;
  }

  if (deactivateSkus.size) {
    await deactivateSentosProducts(sellerId, [...deactivateSkus]);
  }

  await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
  return upsertCount;
};

export const testSentosConnection = async () => {
  const response = await fetchSentosProductsPage(1, 1);
  return {
    connected: true,
    totalElements: Number(response?.total_elements) || 0,
  };
};
