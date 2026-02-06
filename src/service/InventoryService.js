import Inventory from '#models/Inventory.js';
import Product from '#models/Product.js';
import { mapRowToInventory, getSellerNameById, getProductStatus } from '#utils/mapRowToInventory.js';
import { config } from '../config/config.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { ObjectId } from 'mongodb';
import { ALLOWEDMARKETPLACES } from '#constants/common.js';
import { updateSyncDate } from '#helpers/updateSyncDate.js';
import { pushBatch, pushInActiveProductsToChannel } from './productService.js';
import { mapProductToChannelEngine } from '../helpers/ProductMapper.js';
import { getExistingProductsBySkuFromCE } from './channel/ceService.js';

const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY, CHANNEL_ENGINE_BATCH_SIZE, CHANNEL_ENGINE_MAX_CONCURRENT } =
  config;
const MAX_RETRIES = 3;
const MAX_TASK_BUFFER = 1000;
const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);

export const processImportStream = async (stream, { deleteAfter, filePath, locale, sellerId } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;
  const errorDetails = [];
  let invalidRowsCount = 0;
  let rowIndex = 0;

  const incomingSkuSet = new Set();
  const validInventories = [];
  const rowTasks = [];
  const now = new Date();

  // 1. Read & parse CSV
  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        if (rowIndex > MAX_ROWS) {
          reject(new Error('CSV row limit exceeded'));
          stream.destroy();
        }
        const currentRow = rowIndex;

        rowTasks.push(
          limit(async () => {
            try {
              if (Object.values(row).every((v) => !v || String(v).trim() === '')) {
                errorDetails.push({
                  rowNumber: currentRow,
                  errorData: [locale.EMPTY_ROW],
                });
                invalidRowsCount++;
                return;
              }

              const inventory = await mapRowToInventory(row, currentRow, locale);

              if (inventory?.errorData) {
                errorDetails.push(inventory);
                invalidRowsCount++;
                return;
              }

              incomingSkuSet.add(inventory.productSkuCode);
              validInventories.push(inventory);
            } catch (err) {
              console.error('Row parse error:', err.message);
              invalidRowsCount++;
            }
          })
        );
      })
      .on('end', resolve)
      .on('error', reject);
  });

  await Promise.all(rowTasks);

  if (!incomingSkuSet.size) {
    return {
      success: true,
      message: 'No valid rows found',
      updatedCount: 0,
      invalidRowsCount,
      errorDetails,
    };
  }
  const sellerName = await getSellerNameById(sellerId);

  //2. Fetch products
  const products = await Product.find(
    { productSkuCode: { $in: [...incomingSkuSet] } },
    { _id: 1, productSkuCode: 1 }
  ).lean();

  const productMap = new Map(products.map((p) => [p.productSkuCode, p]));

  //3. Fetch existing inventories
  const inventories = await Inventory.find(
    { sellerId, productSkuCode: { $in: [...incomingSkuSet] } },
    { productSkuCode: 1 }
  ).lean();

  const inventorySkuSet = new Set(inventories.map((i) => i.productSkuCode));

  // Remove Duplicate SKU
  const inventoryBySku = new Map();
  for (const inv of validInventories) {
    inventoryBySku.set(inv.productSkuCode, inv);
  }
  const dedupedInventories = [...inventoryBySku.values()];

  //4. Build bulk operations
  const inventoryBulkOps = [];
  const productBulkOps = [];

  for (const inventory of dedupedInventories) {
    const { productSkuCode, currentStockCount, rowNumber } = inventory;

    const product = productMap.get(productSkuCode);

    // Product does not exist
    if (!product) {
      errorDetails.push({
        rowNumber,
        errorData: [`Product does not exist for SKU ${productSkuCode}`],
      });
      invalidRowsCount++;
      continue;
    }

    if (inventorySkuSet.has(productSkuCode)) {
      //Inventory exists → update inventory + product
      inventoryBulkOps.push({
        updateOne: {
          filter: { sellerId, productSkuCode },
          update: {
            $set: {
              currentStockCount,
              lastSyncedAt: now,
            },
          },
        },
      });
    } else {
      //Inventory does not exist → create inventory
      inventoryBulkOps.push({
        insertOne: {
          document: {
            sellerId,
            productId: product._id,
            productSkuCode,
            currentStockCount,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    }
    const prodStatus = getProductStatus(sellerName, currentStockCount);

    // Always update product stock (if product exists)
    productBulkOps.push({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            currentStockCount,
            status: prodStatus,
            updatedAt: now,
          },
        },
      },
    });
  }

  if (!inventoryBulkOps.length) {
    return {
      success: true,
      message: 'No valid inventories to process',
      updatedCount: 0,
      invalidRowsCount,
      errorDetails,
    };
  }

  //5. Execute bulk writes
  let updatedCount = 0;
  const bulkTasks = [];

  for (let i = 0; i < inventoryBulkOps.length; i += batchSize) {
    bulkTasks.push(
      writeLimit(async () => {
        try {
          const invRes = await Inventory.bulkWrite(inventoryBulkOps.slice(i, i + batchSize), { ordered: false });

          await Product.bulkWrite(productBulkOps.slice(i, i + batchSize), { ordered: false });

          updatedCount += (invRes.modifiedCount || 0) + (invRes.insertedCount || 0);
        } catch (err) {
          console.error('Bulk write failed:', err.message);
          errorDetails.push({
            rowNumber: null,
            errorData: ['Bulk write failed for a batch'],
          });
        }
      })
    );
  }

  await Promise.all(bulkTasks);

  //6. Cleanup
  if (deleteAfter && filePath) {
    fs.unlink(filePath, (err) => {
      if (err) console.error('File cleanup failed:', err.message);
    });
  }

  return {
    success: true,
    message: `Processed ${updatedCount} inventories, skipped ${invalidRowsCount} invalid rows`,
    updatedCount,
    invalidRowsCount,
    errorDetails,
  };
};

/* Google Sheet Import */
export const importInventoryFromGoogleSheet = async (url, locale, sellerId) => {
  try {
    console.log('Fetching Google Sheet from URL:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processImportStream(stream, { locale, sellerId });
  } catch (err) {
    console.error('Error in importInventoryFromGoogleSheet:', err);
    throw new Error(err.message); // force the catch block
  }
};

/* CSV File Import */
export const importInventoryFromCsvFile = async (filePath, locale, sellerId) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath, locale, sellerId });
  } catch (err) {
    console.error('Error in importInventoryFromCsvFile:', err);
    throw new Error(err.message); // force the catch block
  }
};

export const updateSingleInventory = async (productId, currentStockCount, locale, sellerId) => {
  try {
    const now = new Date();
    const sellerName = await getSellerNameById(sellerId);

    // 1. Ensure product exists (mandatory for inventory)
    const product = await Product.findOne({ _id: new ObjectId(productId) }, { _id: 1, productSkuCode: 1 }).lean();

    if (!product) {
      const error = new Error(locale.NOT_FOUND);
      error.statusCode = 404;
      throw error;
    }

    // 2. Upsert inventory (insert if missing, update if exists)
    const inventory = await Inventory.findOneAndUpdate(
      { sellerId, productId },
      {
        $set: {
          currentStockCount,
          lastSyncedAt: now,
        },
        $setOnInsert: {
          sellerId,
          productId,
          productSkuCode: product.productSkuCode,
          createdAt: now,
        },
      },
      {
        new: true,
        upsert: true,
        lean: true,
      }
    );
    const prodStatus = getProductStatus(sellerName, currentStockCount);

    // 3. Update product stock count
    await Product.updateOne(
      { _id: productId },
      {
        $set: {
          currentStockCount,
          status: prodStatus,
          updatedAt: now,
        },
      }
    );

    return {
      productId,
      currentStockCount: inventory.currentStockCount,
      lastSyncedAt: inventory.lastSyncedAt,
      inventoryId: inventory._id,
    };
  } catch (err) {
    console.error('Service updateSingleInventory error:', err);
    throw err;
  }
};

async function sendStockBatch(stockUpdates, retries = MAX_RETRIES) {
  try {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}offer/stock?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockUpdates),
    });

    const rawText = await response.text();

    // Do not retry client errors
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Non-retryable HTTP ${response.status}: ${rawText}`);
      }
      throw new Error(`HTTP ${response.status}: ${rawText}`);
    }

    if (!rawText) return { success: true };

    try {
      return JSON.parse(rawText);
    } catch {
      return { success: true };
    }
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, (MAX_RETRIES - retries + 1) * 1000));
      return sendStockBatch(stockUpdates, retries - 1);
    }
    throw err;
  }
}

export const syncStockToChannelEngine = async (sellerId) => {
  try {
    if (!ObjectId.isValid(sellerId)) {
      throw new Error('Invalid sellerId');
    }

    const escaped = ALLOWEDMARKETPLACES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const marketplaceRegex = new RegExp(`(^|,\\s*)(${escaped.join('|')})(?=\\s*,|$)`, 'i');

    const cursor = Product.find({
      sellerId: new ObjectId(sellerId),
      marketPlace: {
        $exists: true,
        $ne: null,
        $regex: marketplaceRegex,
      },
      $or: [{ syncedAt: null }, { $expr: { $gt: ['$updatedAt', '$syncedAt'] } }],
    })
      .lean()
      .cursor();

    let batch = [];
    let totalSynced = 0;
    let failedBatches = 0;
    const tasks = [];
    const processedList = new Set();
    for await (const product of cursor) {
      if (!product.productSkuCode) continue;
      processedList.add(product);
      batch.push({
        MerchantProductNo: product.productSkuCode,
        StockLocations: [{ Stock: Number(product.currentStockCount) || 0 }],
      });

      if (batch.length === Number(CHANNEL_ENGINE_BATCH_SIZE)) {
        const payload = batch;
        batch = [];

        tasks.push(
          limit(() =>
            sendStockBatch(payload)
              .then(() => {
                totalSynced += payload.length;
              })
              .catch((err) => {
                failedBatches++;
                console.error(`Batch failed (${payload.length} items):`, err.message);
              })
          )
        );
      }

      if (tasks.length >= MAX_TASK_BUFFER) {
        await Promise.all(tasks);
        tasks.length = 0;
      }
    }

    // Send remaining batch
    if (batch.length) {
      tasks.push(
        limit(() =>
          sendStockBatch(batch)
            .then(() => {
              totalSynced += batch.length;
            })
            .catch((err) => {
              failedBatches++;
              console.error(`Final batch failed (${batch.length} items):`, err.message);
            })
        )
      );
    }

    // Await remaining tasks
    if (tasks.length) {
      await Promise.all(tasks);
    }
    await syncSkuAvailability([...processedList], sellerId);
    await updateSyncDate(sellerId, 'INVENTORY', totalSynced);

    return {
      success: true,
      message: 'Inventory sync completed',
      totalSynced,
      failedBatches,
    };
  } catch (err) {
    console.error('Service syncProductStock error:', err);
    throw err;
  }
};
export const pushActiveProductsToChannel = async (products, sellerId) => {
  const limitExec = pLimit(MAX_CONCURRENT);
  const batches = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }
  await Promise.allSettled(
    batches.map((batch, idx) =>
      limitExec(async () => {
        const result = await pushBatch(batch.map(mapProductToChannelEngine), idx);
        const skus = batch.map((p) => p.productSkuCode);
        await Product.updateMany(
          { sellerId, productSkuCode: { $in: skus } },
          { $set: { syncedAt: new Date() } },
          { timestamps: false }
        );
        return result;
      })
    )
  );
};

const syncSkuAvailability = async (products, sellerId) => {
  const allSkus = [];
  const dbStatusMap = new Map();

  for (const p of products) {
    if (!p.productSkuCode) continue;

    const sku = p.productSkuCode.trim().toUpperCase();
    allSkus.push(sku);
    dbStatusMap.set(sku, p.status); // active / inactive
  }

  if (!allSkus.length) return;

  const ceProducts = await getExistingProductsBySkuFromCE(allSkus);

  const ceStatusMap = new Map();
  ceProducts.forEach((p) => {
    ceStatusMap.set(p.MerchantProductNo?.toUpperCase(), p.IsActive ? 'active' : 'inactive');
  });

  const pushList = [];
  const deleteList = [];

  for (const sku of allSkus) {
    const dbStatus = dbStatusMap.get(sku);
    const ceStatus = ceStatusMap.get(sku);

    // DB active but CE inactive / not exist
    if (dbStatus === 'active' && ceStatus !== 'active') {
      pushList.push(sku);
    }

    // DB inactive but CE active
    if (dbStatus === 'inactive' && ceStatus === 'active') {
      deleteList.push(sku);
    }
  }

  if (pushList.length) {
    const productsToPush = products.filter((p) => pushList.includes(p.productSkuCode.toUpperCase()));
    await pushActiveProductsToChannel(productsToPush, sellerId);
  }

  if (deleteList.length) {
    await pushInActiveProductsToChannel(deleteList);
  }
};

export default {
  importInventoryFromGoogleSheet,
  importInventoryFromCsvFile,
  updateSingleInventory,
  syncStockToChannelEngine,
};
