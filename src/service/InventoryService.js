import Inventory from '#models/Inventory.js';
import Product from '#models/Product.js';
import { mapRowToInventory, getSellerNameById, getProductStatus } from '#utils/mapRowToInventory.js';
import { config } from '../config/config.js';
import csv from 'csv-parser';
import fs from 'fs';
import { safeUnlinkTempFile } from '../helpers/tempFileCleanup.js';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { ObjectId } from 'mongodb';
import { ALLOWEDMARKETPLACES, MAX_PRICE, MAX_PRICE_SELLERS } from '#constants/common.js';
import { updateSyncDate } from '#helpers/updateSyncDate.js';
import { pushBatch, pushInActiveProductsToChannel } from './productService.js';
import { mapProductToChannelEngine } from '../helpers/ProductMapper.js';
import { chunkArray, getExistingProductsBySkuFromCE } from './channel/ceService.js';
import { getCommerceProvider } from '#service/commerce/commerceProviderFactory.js';
import Seller from '#models/Seller.js';
import ExpressWarehouseInventory from '#models/ExpressWarehouseInventory.js';

const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const { CHANNEL_ENGINE_BATCH_SIZE, CHANNEL_ENGINE_MAX_CONCURRENT } = config;
const MAX_TASK_BUFFER = 1000;
const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || process.env.BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);
const SKU_BATCH_SIZE = 50;

export const processImportStream = async (stream, { deleteAfter, filePath, locale, sellerId } = {}) => {
  try {
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
      { sellerId, productSkuCode: { $in: [...incomingSkuSet] } },
      { _id: 1, productSkuCode: 1, price: 1 }
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
      let prodStatus = getProductStatus(sellerName, currentStockCount);
      if (MAX_PRICE_SELLERS.includes(sellerName) && (product.price ?? 0) >= MAX_PRICE) {
        prodStatus = 'inactive';
      }

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

    return {
      success: true,
      message: `Processed ${updatedCount} inventories, skipped ${invalidRowsCount} invalid rows`,
      updatedCount,
      invalidRowsCount,
      errorDetails,
    };
  } finally {
    if (deleteAfter && filePath) {
      await safeUnlinkTempFile(filePath);
    }
  }
};

/* Google Sheet Import */
export const importInventoryFromGoogleSheet = async (url, locale, sellerId) => {
  try {
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
    const product = await Product.findOne(
      { _id: new ObjectId(productId) },
      { _id: 1, productSkuCode: 1, price: 1 }
    ).lean();

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
    let prodStatus = getProductStatus(sellerName, currentStockCount);
    if (MAX_PRICE_SELLERS.includes(sellerName) && (product.price ?? 0) >= MAX_PRICE) {
      prodStatus = 'inactive';
    }

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

export async function sendStockBatch(stockUpdates, sellerId = null, batchId = null) {
  const resolvedSellerId = (typeof sellerId === 'number' || sellerId === undefined) && batchId ? batchId : sellerId;
  const resolvedBatchId = (typeof sellerId === 'number' || sellerId === undefined) && batchId ? null : batchId;
  try {
    // Fire-and-forget — worker pushes to CE at its own rate limit pace
    await getCommerceProvider().putOfferStock(stockUpdates, {
      sellerId: resolvedSellerId,
      batchId: resolvedBatchId,
      awaitResult: false,
    });
    return { success: true };
  } catch (err) {
    console.error('[sendStockBatch] Failed to enqueue:', err.message);
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
      syncedAt: { $ne: null },
      $expr: { $gt: ['$updatedAt', '$syncedAt'] },
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

      if (batch.length >= BATCH_SIZE) {
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
  const skuSet = new Set();
  const dbStatusMap = new Map();

  for (const p of products) {
    if (!p.productSkuCode) continue;

    const sku = p.productSkuCode.trim().toUpperCase();
    skuSet.add(sku);
    dbStatusMap.set(sku, p.status);
  }

  if (!skuSet.size) return;
  const skuArray = [...skuSet];
  const skuBatches = chunkArray(skuArray, SKU_BATCH_SIZE);

  // Fetch CE products in batches
  const ceStatusMap = new Map();

  for (const batch of skuBatches) {
    const ceProducts = await getExistingProductsBySkuFromCE(batch);
    ceProducts.forEach((p) => {
      const sku = p.MerchantProductNo?.trim().toUpperCase();
      ceStatusMap.set(sku, p.IsActive ? 'active' : 'inactive');
    });
  }
  const pushList = [];
  const deleteList = [];

  for (const sku of skuSet) {
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
    const pushSet = new Set(pushList);
    const productsToPush = products.filter((p) => pushSet.has(p.productSkuCode?.toUpperCase()));
    await pushActiveProductsToChannel(productsToPush, sellerId);
  }

  if (deleteList.length) {
    await pushInActiveProductsToChannel(deleteList);
  }
};

export const importExpressWarehouseProductsFromGoogleSheet = async (url, locale) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processExpressWarehouseImportStream(stream, { locale });
  } catch (err) {
    console.error('Error in importProductsFromGoogleSheet:', err);
    throw new Error(err.message); // force the catch block
  }
};

const getStatus = (qty) => {
  if (qty <= 0) return 'out_of_stock';
  if (qty < 5) return 'low_stock';
  return 'in_stock';
};

const getValue = (row, keys = []) => {
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const foundKey = rowKeys.find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (foundKey) return row[foundKey];
  }
  return undefined;
};

const pushError = (errorDetails, rowNumber, message) => {
  const existing = errorDetails.find((e) => e.rowNumber === rowNumber);
  if (existing) {
    existing.errorData.push(message);
  } else {
    errorDetails.push({
      rowNumber,
      errorData: [message],
    });
  }
};

export const processExpressWarehouseImportStream = async (stream, { deleteAfter, filePath } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;

  const errorDetails = [];
  const parsedRows = [];

  let invalidRowsCount = 0;
  let rowIndex = 1;
  let totalRows = 0;

  const incomingSkuSet = new Set();
  const incomingSellerSet = new Set();

  let insertedCount = 0;
  let updatedCount = 0;

  // -----------------------------
  // 1. READ CSV
  // -----------------------------
  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        totalRows++;
        const currentRow = rowIndex;

        try {
          const normalizedRow = {};
          Object.keys(row).forEach((k) => {
            normalizedRow[k.trim()] = row[k];
          });

          const sku = getValue(normalizedRow, ['SKU'])?.trim();
          const sellerName = getValue(normalizedRow, ['Brand'])?.trim();
          const notes = getValue(normalizedRow, ['Notes'])?.trim() || '';

          const orderId =
            getValue(normalizedRow, ['Order Number', 'Ordernumber', 'Order No', 'Order No.'])?.trim() || '';
          const quantity = Number(getValue(normalizedRow, ['Available qty', 'Available Qty', 'available qty']) || 0);

          if (!sku || !sellerName) {
            invalidRowsCount++;
            pushError(errorDetails, currentRow, 'Missing SKU or Brand');
            return;
          }

          incomingSkuSet.add(sku);
          incomingSellerSet.add(sellerName.toLowerCase());

          parsedRows.push({
            sku,
            quantity,
            sellerName,
            notes,
            orderId,
            row: currentRow,
          });
        } catch (err) {
          invalidRowsCount++;
          pushError(errorDetails, currentRow, err.message);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // -----------------------------
  // 2. PRODUCTS
  // -----------------------------
  const products = await Product.find({
    productSkuCode: { $in: Array.from(incomingSkuSet) },
  }).select('_id productSkuCode');

  const productMap = new Map();
  products.forEach((p) => {
    productMap.set(p.productSkuCode, p._id);
  });

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // -----------------------------
  // 3. SELLERS
  // -----------------------------
  const sellerRegexList = Array.from(incomingSellerSet).map((name) => ({
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
  }));

  const sellers = await Seller.find({
    $or: sellerRegexList,
  }).select('_id name');

  const sellerMap = new Map();
  sellers.forEach((s) => {
    sellerMap.set(s.name.toLowerCase(), {
      sellerId: s._id,
      sellerName: s.name,
    });
  });

  // -----------------------------
  // 4. EXISTING RECORDS
  // -----------------------------
  const existingRecords = await ExpressWarehouseInventory.find({
    sku: { $in: Array.from(incomingSkuSet) },
  }).select('sku sellerId orderId');

  const existingSet = new Set(existingRecords.map((rec) => `${rec.sku}_${rec.sellerId}_${rec.orderId || ''}`));

  // -----------------------------
  // 5. BULK OPS
  // -----------------------------
  const bulkOps = [];
  const inventoryBulkOps = [];

  for (const row of parsedRows) {
    const { sku, quantity, sellerName, notes, orderId, row: currentRow } = row;

    const sellerData = sellerMap.get(sellerName.toLowerCase());

    if (!sellerData) {
      invalidRowsCount++;
      pushError(errorDetails, currentRow, `${sellerName} seller is not available`);
      continue;
    }

    const { sellerId, sellerName: validSellerName } = sellerData;

    const productId = productMap.get(sku);

    if (!productId) {
      invalidRowsCount++;
      pushError(errorDetails, currentRow, `SKU not found: ${sku}`);
      continue;
    }

    const qty = Number(quantity) || 0;

    const key = `${sku}_${sellerId}_${orderId}`;

    if (existingSet.has(key)) updatedCount++;
    else insertedCount++;

    // ------------------ EXPRESS WAREHOUSE ------------------
    bulkOps.push({
      updateOne: {
        filter: {
          sku,
          sellerId,
          orderId,
        },
        update: {
          $set: {
            sku,
            sellerName: validSellerName,
            quantity: qty,
            notes,
            orderId,
            status: getStatus(qty),
            lastSyncedAt: new Date(),
          },
        },
        upsert: true,
      },
    });

    // ------------------ BATCH EXEC ------------------
    if (bulkOps.length === batchSize) {
      await ExpressWarehouseInventory.bulkWrite(bulkOps);

      bulkOps.length = 0;
      inventoryBulkOps.length = 0;
    }
  }

  // FINAL FLUSH
  if (bulkOps.length) {
    await ExpressWarehouseInventory.bulkWrite(bulkOps);
  }

  if (deleteAfter && filePath) {
    const fs = await import('fs');
    fs.unlink(filePath, () => {});
  }

  errorDetails.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    success: true,
    message: `Imported ${insertedCount} new products, updated ${updatedCount}, skipped ${invalidRowsCount} invalid rows out of ${totalRows} total rows`,
    totalRows,
    processedRows: insertedCount + updatedCount,
    insertedCount,
    updatedCount,
    invalidRowsCount,
    errorDetails,
  };
};

export default {
  importInventoryFromGoogleSheet,
  importInventoryFromCsvFile,
  updateSingleInventory,
  syncStockToChannelEngine,
  importExpressWarehouseProductsFromGoogleSheet,
};
