import Inventory from '#models/Inventory.js';
import Product from '#models/Product.js';
import { mapRowToInventory } from '#utils/mapRowToInventory.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;

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

    // Always update product stock (if product exists)
    productBulkOps.push({
      updateOne: {
        filter: { _id: product._id },
        update: {
          $set: {
            currentStockCount,
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

    // 1. Update inventory record
    const inventory = await Inventory.findOneAndUpdate(
      { sellerId, productId },
      {
        $set: {
          currentStockCount,
          lastSyncedAt: now,
        },
      },
      {
        new: true,
        lean: true,
      }
    );

    if (!inventory) {
      const error = new Error(locale.NOT_FOUND);
      error.statusCode = 404;
      throw error;
    }

    // 2. Update product stock count
    const productUpdateResult = await Product.updateOne(
      { _id: productId },
      {
        $set: {
          currentStockCount: currentStockCount,
          updatedAt: now,
        },
      }
    );

    if (productUpdateResult.matchedCount === 0) {
      console.warn(`Product stock update failed for productId=${productId}`);
    }

    return {
      productId,
      currentStockCount: inventory.currentStockCount,
      lastSyncedAt: inventory.lastSyncedAt,
    };
  } catch (err) {
    console.error('Service updateSingleInventory error:', err);
    throw err;
  }
};

export default {
  importInventoryFromGoogleSheet,
  importInventoryFromCsvFile,
  updateSingleInventory,
};
