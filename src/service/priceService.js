import Price from '#models/Price.js';
import Product from '#models/Product.js';
import { mapRowToPrice } from '#utils/mapRowToPrice.js';
import { config } from '../config/config.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { ObjectId } from 'mongodb';

const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;
const MAX_ERRORS = 1000;
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY, CHANNEL_ENGINE_BATCH_SIZE } = config;
const MAX_RETRIES = 3;
const MAX_TASK_BUFFER = 1000;

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
      const set = { updatedAt: now };

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
    fs.unlink(filePath, (err) => {
      if (err) console.error('File cleanup failed:', err.message);
    });
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

export const updateSingleProductPrice = async (
  pricePayload, // { price, minPrice?, maxPrice?, msrp?, purchasePrice? }
  locale,
  sellerId
) => {
  try {
    const { productId } = pricePayload;

    const priceValue = Number(pricePayload.price);
    const now = new Date();

    // 1. Ensure product exists
    const product = await Product.findOne({ _id: new ObjectId(productId) }, { _id: 1, productSkuCode: 1 }).lean();

    if (!product) {
      const error = new Error(locale.NOT_FOUND || 'Product not found');
      error.statusCode = 404;
      throw error;
    }

    // 2. Build $set dynamically (ONLY provided fields)
    const setData = {
      price: priceValue,
      updatedAt: now,
    };

    const addOptionalNumber = (key) => {
      if (pricePayload[key] !== undefined) {
        const num = Number(pricePayload[key]);
        if (Number.isNaN(num) || num < 0) {
          const error = new Error(
            locale.INVALID_NUMBER ? `${locale.INVALID_NUMBER} (${key})` : `Invalid number (${key})`
          );
          error.statusCode = 400;
          throw error;
        }
        setData[key] = num;
      }
    };

    addOptionalNumber('minPrice');
    addOptionalNumber('maxPrice');
    addOptionalNumber('msrp');
    addOptionalNumber('purchasePrice');

    // 3. Upsert price document
    const priceDoc = await Price.findOneAndUpdate(
      { sellerId, productId },
      {
        $set: setData,
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

    // 4. Update product price only (optional fields stay in Price)
    const productSet = {
      price: priceValue,
      updatedAt: now,
    };

    if (pricePayload.minPrice !== undefined) productSet.minPrice = pricePayload.minPrice;
    if (pricePayload.maxPrice !== undefined) productSet.maxPrice = pricePayload.maxPrice;
    if (pricePayload.msrp !== undefined) productSet.msrp = pricePayload.msrp;
    if (pricePayload.purchasePrice !== undefined) productSet.purchasePrice = pricePayload.purchasePrice;

    // Update Product
    await Product.updateOne({ _id: productId }, { $set: productSet });

    return {
      productId,
      priceId: priceDoc._id,
      price: priceDoc.price,
      updatedAt: priceDoc.updatedAt,
    };
  } catch (err) {
    console.error('Service updateSingleProductPrice error:', err);
    throw err;
  }
};

/* CSV File Import */
export const importPriceFromCsvFile = async (filePath, locale, sellerId) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath, locale, sellerId });
  } catch (err) {
    console.error('Error in importPriceFromCsvFile:', err);
    throw new Error(err.message); // force the catch block
  }
};

async function sendPriceBatch(priceUpdates, retries = MAX_RETRIES) {
  try {
    console.log({ priceUpdates });
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}offer?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(priceUpdates),
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
      return sendPriceBatch(priceUpdates, retries - 1);
    }
    throw err;
  }
}

export const syncPriceToChannelEngine = async (sellerId) => {
  try {
    if (!ObjectId.isValid(sellerId)) {
      throw new Error('Invalid sellerId');
    }

    const allowedMarketplaces = ['Amazon.sa (v3)', 'Noon V2', 'Trendyol.int SA', 'Namshi'];

    const marketplaceRegex = new RegExp(
      allowedMarketplaces.map((m) => `\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|'),
      'i'
    );

    const cursor = Product.find(
      {
        sellerId: new ObjectId(sellerId),
        marketPlace: {
          $exists: true,
          $ne: null,
          $regex: marketplaceRegex,
        },
        price: { $type: 'number', $gte: 0 },
      },
      { productSkuCode: 1, price: 1 }
    )
      .lean()
      .cursor();

    let batch = [];
    let totalSynced = 0;
    let failedBatches = 0;
    const tasks = [];

    for await (const product of cursor) {
      if (!product.productSkuCode) continue;

      batch.push({
        MerchantProductNo: product.productSkuCode,
        Price: product.price,
      });
      if (batch.length === Number(CHANNEL_ENGINE_BATCH_SIZE)) {
        const payload = batch;
        batch = [];
        tasks.push(
          limit(() =>
            sendPriceBatch(payload)
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
          sendPriceBatch(batch)
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

    return {
      success: true,
      message: 'Price sync completed',
      totalSynced,
      failedBatches,
    };
  } catch (err) {
    console.error('Service syncProductPrice error:', err);
    throw err;
  }
};

export default {
  importPriceFromGoogleSheet,
  updateSingleProductPrice,
  importPriceFromCsvFile,
  syncPriceToChannelEngine,
};
