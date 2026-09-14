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
import { logSentosError, logSentosInfo, logSentosWarn } from '../utils/logger.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

export const fetchSentosProductsPage = async (page = 1, size = SENTOS_DEFAULT_PAGE_SIZE, logContext = 'API') => {
  const query = new URLSearchParams({
    page: String(page),
    size: String(size),
    orderby_id: 'ASC',
  });

  await new Promise((resolve) => setTimeout(resolve, SENTOS_FETCH_DELAY_MS));
  return sentosFetch(`products?${query.toString()}`, { method: 'GET', logContext });
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

const logBulkWriteIssues = (label, result) => {
  const writeErrors = typeof result?.getWriteErrors === 'function' ? result.getWriteErrors() : [];
  if (!writeErrors.length) return;

  logSentosWarn(`${label} bulkWrite had write errors`, {
    errorCount: writeErrors.length,
    sample: writeErrors.slice(0, 3).map((e) => ({
      index: e.index,
      code: e.code,
      errmsg: e.errmsg,
    })),
  });
};

export const importAllSentosProducts = async (sellerId) => {
  const syncContext = 'Product Sync';
  logSentosInfo('Started background import', { sellerId, syncContext });

  const categoryMap = await fetchSentosCategories(syncContext);
  logSentosInfo('Categories loaded', { sellerId, categoryCount: categoryMap.size });

  let page = 1;
  let upsertCount = 0;
  const deactivateSkus = new Set();

  while (true) {
    const response = await fetchSentosProductsPage(page, SENTOS_DEFAULT_PAGE_SIZE, syncContext);
    const list = Array.isArray(response?.data) ? response.data : [];
    const totalElements = Number(response?.total_elements) || 0;
    const totalPages = Number(response?.total_pages) || page;

    logSentosInfo('Products page fetched', {
      sellerId,
      page,
      totalPages,
      totalElements,
      rowsOnPage: list.length,
    });

    if (!list.length) {
      if (page === 1) {
        logSentosWarn('No products returned on first page', { sellerId, totalElements, totalPages });
      }
      break;
    }

    const { products, parentsToDeactivate } = await formatSentosProducts(list, sellerId, categoryMap);
    parentsToDeactivate.forEach((sku) => deactivateSkus.add(sku));

    const skippedOnPage = list.length - products.length;
    if (skippedOnPage > 0) {
      logSentosWarn('Rows skipped on page (often zero warehouse stock)', {
        sellerId,
        page,
        rawRows: list.length,
        importableRows: products.length,
        skippedApprox: skippedOnPage,
      });
    }

    if (products.length) {
      await processInBatches(
        products,
        MAX_BATCH_SIZE,
        async (batch) => {
          const canonical = batch.map((item) => canonicalProductMapper(item, sellerId)).filter(Boolean);

          if (!canonical.length) {
            logSentosWarn('Batch produced no canonical products after mapping', {
              sellerId,
              page,
              batchSize: batch.length,
            });
            return;
          }

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

          try {
            const result = await Product.bulkWrite(bulkOps, { ordered: false });
            logBulkWriteIssues('Product', result);
            upsertCount = calculateUpsertCount(upsertCount, result.upsertedCount + result.modifiedCount);
            logSentosInfo('Batch upserted', {
              sellerId,
              page,
              upserted: result.upsertedCount,
              modified: result.modifiedCount,
              runningTotal: upsertCount,
            });
          } catch (err) {
            logSentosError('Product bulkWrite failed', {
              sellerId,
              page,
              message: err.message,
              code: err.code,
              name: err.name,
            });
            throw err;
          }
        },
        BATCH_CONCURRENCY
      );
    } else {
      logSentosWarn('No importable products on page after formatting', { sellerId, page, rawRows: list.length });
    }

    if (page >= totalPages) break;
    page++;
  }

  if (deactivateSkus.size) {
    await deactivateSentosProducts(sellerId, [...deactivateSkus]);
    logSentosInfo('Deactivated parent SKUs with no in-stock variants', {
      sellerId,
      count: deactivateSkus.size,
    });
  }

  await updateSyncDate(sellerId, 'PRODUCT', upsertCount);
  logSentosInfo('Import completed', { sellerId, upsertCount });
  return upsertCount;
};

export const testSentosConnection = async () => {
  const response = await fetchSentosProductsPage(1, 1, 'Connection Test');
  const totalElements = Number(response?.total_elements) || 0;
  logSentosInfo('Connection test OK', { totalElements });
  return {
    connected: true,
    totalElements,
  };
};
