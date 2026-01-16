import Price from '#models/Price.js';
import Product from '#models/Product.js';
import { mapRowToPrice } from '#utils/mapRowToPrice.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';

const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;
const MAX_ERRORS = 1000;

export const processImportStream = async (stream, { deleteAfter = false, filePath, locale, sellerId } = {}) => {
  if (!stream || !sellerId || !locale) {
    throw new Error('Invalid import request');
  }

  let rowIndex = 0;
  let invalidRowsCount = 0;
  let updatedCount = 0;
  let aborted = false;

  const errorDetails = [];
  const now = new Date();

  const pushError = (err) => {
    if (errorDetails.length < MAX_ERRORS) {
      errorDetails.push(err);
    }
  };

  // ---------- Stream processing ----------
  await new Promise((resolve, reject) => {
    let rowBuffer = [];

    stream
      .pipe(csv())
      .on('data', (row) => {
        if (aborted) return;

        rowIndex++;
        const rowNumber = rowIndex;

        if (rowIndex > MAX_ROWS) {
          aborted = true;
          stream.destroy();
          return reject(new Error('CSV row limit exceeded'));
        }

        rowBuffer.push({ row, rowNumber });

        if (rowBuffer.length >= BATCH_SIZE) {
          stream.pause();
          writeLimit(() => processRowChunk(rowBuffer))
            .then((delta) => {
              updatedCount += delta;
              rowBuffer = [];
              stream.resume();
            })
            .catch(reject);
        }
      })
      .on('end', async () => {
        if (rowBuffer.length) {
          const delta = await writeLimit(() => processRowChunk(rowBuffer));
          updatedCount += delta;
        }
        resolve();
      })
      .on('error', reject);
  });

  // ---------- Chunk processor ----------
  async function processRowChunk(rows) {
    if (aborted) return 0;

    const validPrices = [];
    let chunkUpdated = 0;

    await Promise.all(
      rows.map(({ row, rowNumber }) =>
        limit(async () => {
          try {
            if (Object.values(row).every((v) => !v || String(v).trim() === '')) {
              pushError({
                rowNumber,
                errorData: [locale.EMPTY_ROW || 'Empty row'],
              });
              invalidRowsCount++;
              return;
            }

            const price = mapRowToPrice(row, rowNumber, locale);
            if (price?.errorData) {
              pushError(price);
              invalidRowsCount++;
              return;
            }

            validPrices.push(price);
          } catch {
            invalidRowsCount++;
            pushError({
              rowNumber,
              errorData: ['Row processing failed'],
            });
          }
        })
      )
    );

    if (!validPrices.length) return 0;

    // Deduplicate by SKU (last write wins)
    const priceBySku = new Map();
    for (const p of validPrices) {
      priceBySku.set(p.productSkuCode, p);
    }

    const dedupedPrices = [...priceBySku.values()];
    const skus = dedupedPrices.map((p) => p.productSkuCode);

    const [products, existingPrices] = await Promise.all([
      Product.find({ sellerId, productSkuCode: { $in: skus } }, { _id: 1, productSkuCode: 1 }).lean(),
      Price.find({ sellerId, productSkuCode: { $in: skus } }, { productSkuCode: 1 }).lean(),
    ]);

    const productMap = new Map(products.map((p) => [p.productSkuCode, p]));
    const existingPriceSet = new Set(existingPrices.map((p) => p.productSkuCode));

    const priceBulkOps = [];
    const productBulkOps = [];

    const buildSet = (data) => {
      const set = { lastSyncedAt: now };

      if (data.price !== undefined) set.price = data.price;
      if (data.minPrice !== undefined) set.minPrice = data.minPrice;
      if (data.maxPrice !== undefined) set.maxPrice = data.maxPrice;
      if (data.msrp !== undefined) set.msrp = data.msrp;
      if (data.purchasePrice !== undefined) set.purchasePrice = data.purchasePrice;

      return set;
    };

    for (const priceData of dedupedPrices) {
      const product = productMap.get(priceData.productSkuCode);

      if (!product) {
        invalidRowsCount++;
        pushError({
          rowNumber: priceData.rowNumber,
          errorData: [`Product does not exist for SKU ${priceData.productSkuCode}`],
        });
        continue;
      }

      if (existingPriceSet.has(priceData.productSkuCode)) {
        priceBulkOps.push({
          updateOne: {
            filter: { sellerId, productSkuCode: priceData.productSkuCode },
            update: { $set: buildSet(priceData) },
          },
        });
      } else {
        priceBulkOps.push({
          insertOne: {
            document: {
              sellerId,
              productId: product._id,
              productSkuCode: priceData.productSkuCode,
              ...buildSet(priceData),
              createdAt: now,
              updatedAt: now,
            },
          },
        });
      }

      productBulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: buildSet(priceData) },
        },
      });
    }

    if (!priceBulkOps.length) return 0;

    try {
      const priceRes = await Price.bulkWrite(priceBulkOps, { ordered: false });
      chunkUpdated = (priceRes.modifiedCount || 0) + (priceRes.insertedCount || 0);
    } catch {
      pushError({
        rowNumber: null,
        errorData: ['Price bulk write failed'],
      });
      return 0;
    }

    try {
      await Product.bulkWrite(productBulkOps, { ordered: false });
    } catch {
      pushError({
        rowNumber: null,
        errorData: ['Product bulk update partially failed'],
      });
    }

    return chunkUpdated;
  }

  // ---------- Cleanup ----------
  if (deleteAfter && filePath) {
    await fs.unlink(filePath).catch(() => {});
  }

  return {
    success: true,
    message: `Processed ${updatedCount} records, skipped ${invalidRowsCount}`,
    updatedCount,
    invalidRowsCount,
    errorDetails,
  };
};

/* Google Sheet Import */
export const importPriceFromGoogleSheet = async (url, locale, sellerId) => {
  try {
    console.log('Fetching Google Sheet from URL:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processImportStream(stream, { locale, sellerId });
  } catch (err) {
    console.error('Error in importPriceFromGoogleSheet:', err);
    throw new Error(err.message); // force the catch block
  }
};

export default {
  importPriceFromGoogleSheet,
};
