import Inventory from '#models/Inventory.js';
import { mapRowToInventory } from '#utils/mapRowToInventory.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);

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

              const sku = row.ProductSkuCode;
              if (sku) incomingSkuSet.add(String(sku).trim());

              const inventory = await mapRowToInventory(row, currentRow, locale);

              if (inventory?.errorData) {
                errorDetails.push(inventory);
                invalidRowsCount++;
                return;
              }

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
    return { success: true, message: 'No valid rows found' };
  }

  // 2. Fetch existing inventories
  const existingInventories = await Inventory.find(
    { sellerId, productSkuCode: { $in: [...incomingSkuSet] } },
    { productSkuCode: 1 }
  ).lean();

  const existingSkuSet = new Set(existingInventories.map((i) => i.productSkuCode));

  // 3. Validate & build bulk ops
  const bulkOps = [];

  for (const inventory of validInventories) {
    if (!existingSkuSet.has(inventory.productSkuCode)) {
      errorDetails.push({
        rowNumber: inventory.rowNumber,
        errorData: [`Inventory does not exist for SKU ${inventory.productSkuCode}`],
      });
      invalidRowsCount++;
      continue;
    }

    if (typeof inventory.currentStockCount !== 'number' || inventory.currentStockCount < 0) {
      errorDetails.push({
        rowNumber: inventory.rowNumber,
        errorData: [`Stock must be 0 or greater for SKU ${inventory.productSkuCode}`],
      });
      invalidRowsCount++;
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { sellerId, productSkuCode: inventory.productSkuCode },
        update: {
          $set: {
            currentStockCount: inventory.currentStockCount,
            lastSyncedAt: now,
          },
        },
      },
    });
  }

  if (!bulkOps.length) {
    return {
      success: true,
      message: 'No valid inventories to update',
      updatedCount: 0,
      invalidRowsCount,
      errorDetails,
    };
  }

  // 4. Bulk write
  let updatedCount = 0;
  const bulkTasks = [];

  for (let i = 0; i < bulkOps.length; i += batchSize) {
    bulkTasks.push(
      writeLimit(async () => {
        const res = await Inventory.bulkWrite(bulkOps.slice(i, i + batchSize), { ordered: false });
        updatedCount += res.matchedCount || 0;
      })
    );
  }

  await Promise.all(bulkTasks);

  // 5. Cleanup
  if (deleteAfter && filePath) {
    fs.unlink(filePath, () => {});
  }

  return {
    success: true,
    message: `Updated ${updatedCount} inventories, skipped ${invalidRowsCount} invalid rows`,
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

export default {
  importInventoryFromGoogleSheet,
};
