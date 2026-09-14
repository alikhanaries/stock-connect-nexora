import Product from '#models/Product.js';
import Inventory from '#models/Inventory.js';
import { updateSyncDate } from '#root/src/helpers/updateSyncDate.js';
import { resolveHierarchyStatus } from '#root/src/helpers/ProductHierarchy.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { formatSentosInventoryRows } from '../helpers/formatInventory.js';
import { fetchSentosProductsPage } from './productService.js';
import { SENTOS_DEFAULT_PAGE_SIZE } from '../constants/common.js';
import { logSentosError, logSentosInfo } from '../utils/logger.js';

const { MAX_BATCH_SIZE, BATCH_CONCURRENCY } = erpCommonConfig;

const normalizeSku = (sku) =>
  String(sku || '')
    .trim()
    .toUpperCase();

export const sentosInventorySync = async (sellerId) => {
  const syncContext = 'Inventory Sync';
  logSentosInfo('Started', { sellerId, syncContext });

  let page = 1;
  let updatedCount = 0;
  const updatedSkus = [];

  try {
  while (true) {
    const response = await fetchSentosProductsPage(page, SENTOS_DEFAULT_PAGE_SIZE, syncContext);
    const list = Array.isArray(response?.data) ? response.data : [];
    if (!list.length) break;

    await processInBatches(
      list,
      MAX_BATCH_SIZE,
      async (batch) => {
        const { products } = formatSentosInventoryRows(batch, sellerId);
        if (!products.length) return;

        const skuList = products.map((p) => p.productSkuCode);
        const existingProducts = await Product.find(
          { sellerId, productSkuCode: { $in: skuList } },
          { _id: 1, productSkuCode: 1 }
        ).lean();

        const productMap = new Map(existingProducts.map((p) => [normalizeSku(p.productSkuCode), p]));
        const now = new Date();
        const productOps = [];
        const inventoryOps = [];

        for (const row of products) {
          const existing = productMap.get(normalizeSku(row.productSkuCode));
          if (!existing) continue;

          productOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: row.productSkuCode },
              update: {
                $set: {
                  currentStockCount: row.currentStockCount,
                  status: row.status,
                  updatedAt: now,
                },
              },
            },
          });

          inventoryOps.push({
            updateOne: {
              filter: { sellerId, productSkuCode: row.productSkuCode },
              update: {
                $set: {
                  currentStockCount: row.currentStockCount,
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

          updatedSkus.push(row.productSkuCode);
        }

        if (productOps.length) {
          const result = await Product.bulkWrite(productOps, { ordered: false });
          await Inventory.bulkWrite(inventoryOps, { ordered: false });
          updatedCount += result.modifiedCount;
        }
      },
      BATCH_CONCURRENCY
    );

    const totalPages = Number(response?.total_pages) || page;
    if (page >= totalPages) break;
    page++;
  }

  if (updatedSkus.length) {
    await resolveHierarchyStatus(sellerId, updatedSkus);
  }

  await updateSyncDate(sellerId, 'INVENTORY', updatedCount);

  logSentosInfo('Completed', { sellerId, syncContext, updatedCount });
  return { success: true, updatedCount };
  } catch (err) {
    logSentosError('Failed', { sellerId, syncContext, message: err.message, stack: err.stack });
    throw err;
  }
};
