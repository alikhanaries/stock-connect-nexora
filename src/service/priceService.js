import Price from '#models/Price.js';
import Product from '#models/Product.js';
import { mapRowToPrice } from '#utils/mapRowToPrice.js';
import { getProductStatus, getSellerNameById } from '#utils/mapRowToInventory.js';
import { config } from '../config/config.js';
import csv from 'csv-parser';
import fs from 'fs';
import { safeUnlinkTempFile } from '../helpers/tempFileCleanup.js';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { ObjectId } from 'mongodb';
import { ALLOWEDMARKETPLACES } from '#constants/common.js';
import { updateSyncDate } from '../helpers/updateSyncDate.js';
import { resolveHierarchyStatus } from '../helpers/ProductHierarchy.js';
import { getCommerceProvider } from '#service/commerce/commerceProviderFactory.js';

const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);
const MAX_ROWS = Number(process.env.MAX_IMPORT_ROWS) || 50000;
const { CHANNEL_ENGINE_BATCH_SIZE } = config;
const BATCH_SIZE = Number(CHANNEL_ENGINE_BATCH_SIZE || process.env.BATCH_SIZE) || 500;
const MAX_ERRORS = 1000;
const MAX_TASK_BUFFER = 1000;

export const processImportStream = async (stream, { deleteAfter = false, filePath, locale, sellerId } = {}) => {
  try {
    if (!stream || !sellerId || !locale) {
      throw new Error('Invalid import request');
    }

    let rowIndex = 0;
    let invalidRowsCount = 0;
    let updatedCount = 0;
    let aborted = false;

    const errorDetails = [];
    const now = new Date();
    const sellerName = await getSellerNameById(sellerId);

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
        Product.find(
          { sellerId, productSkuCode: { $in: skus } },
          { _id: 1, productSkuCode: 1, currentStockCount: 1 }
        ).lean(),
        Price.find({ sellerId, productSkuCode: { $in: skus } }, { productSkuCode: 1 }).lean(),
      ]);

      const productMap = new Map(products.map((p) => [p.productSkuCode, p]));
      const existingPriceSet = new Set(existingPrices.map((p) => p.productSkuCode));

      const priceBulkOps = [];
      const productBulkOps = [];

      const buildSet = (data) => {
        const set = { updatedAt: now };

        if (data.price !== undefined) set.price = data.price;
        if (data.namshiPrice !== undefined) set.namshiPrice = data.namshiPrice;
        if (data.noonPrice !== undefined) set.noonPrice = data.noonPrice;
        if (data.minPrice !== undefined) set.minPrice = data.minPrice;
        if (data.maxPrice !== undefined) set.maxPrice = data.maxPrice;
        if (data.msrp !== undefined) set.msrp = data.msrp;
        if (data.purchasePrice !== undefined) set.purchasePrice = data.purchasePrice;
        if (data.amazonPrice !== undefined) set.amazonPrice = data.amazonPrice;

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

        const newStatus = getProductStatus(sellerName, product.currentStockCount || 0, priceData.price || 0);
        productBulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { ...buildSet(priceData), status: newStatus } },
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
        const updatedSkus = dedupedPrices.filter((p) => productMap.has(p.productSkuCode)).map((p) => p.productSkuCode);
        await resolveHierarchyStatus(sellerId, updatedSkus);
      } catch {
        pushError({
          rowNumber: null,
          errorData: ['Product bulk update partially failed'],
        });
      }

      return chunkUpdated;
    }

    // ---------- Cleanup ----------
    return {
      success: true,
      message: `Processed ${updatedCount} records, skipped ${invalidRowsCount}`,
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

export const updateSingleProductPrice = async (pricePayload, locale, sellerId) => {
  try {
    const { productId, price, namshiPrice, noonPrice, minPrice, maxPrice, msrp, purchasePrice } = pricePayload;
    const now = new Date();

    // 1. Ensure product exists
    const product = await Product.findOne(
      { _id: new ObjectId(productId) },
      { _id: 1, productSkuCode: 1, currentStockCount: 1, price: 1 }
    ).lean();

    if (!product) {
      const error = new Error(locale.NOT_FOUND || 'Product not found');
      error.statusCode = 404;
      throw error;
    }

    // 2. Build $set dynamically (ONLY provided fields)
    const setData = {
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
    addOptionalNumber('price');
    addOptionalNumber('namshiPrice');
    addOptionalNumber('noonPrice');
    addOptionalNumber('minPrice');
    addOptionalNumber('maxPrice');
    addOptionalNumber('msrp');
    addOptionalNumber('purchasePrice');
    addOptionalNumber('amazonPrice');

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
      updatedAt: now,
    };

    if (price !== undefined) productSet.price = price;
    if (namshiPrice !== undefined) productSet.namshiPrice = namshiPrice;
    if (noonPrice !== undefined) productSet.noonPrice = noonPrice;
    if (minPrice !== undefined) productSet.minPrice = minPrice;
    if (maxPrice !== undefined) productSet.maxPrice = maxPrice;
    if (msrp !== undefined) productSet.msrp = msrp;
    if (purchasePrice !== undefined) productSet.purchasePrice = purchasePrice;
    if (pricePayload.amazonPrice !== undefined) productSet.amazonPrice = pricePayload.amazonPrice;

    // Re-evaluate status: use the incoming price if provided, otherwise fall back to the current DB price
    const sellerName = await getSellerNameById(sellerId);
    const effectivePrice = price !== undefined ? price : product.price || 0;
    productSet.status = getProductStatus(sellerName, product.currentStockCount || 0, effectivePrice);

    // Update Product
    await Product.updateOne({ _id: productId }, { $set: productSet });

    let sendData = {
      productId,
      priceId: priceDoc._id,
      updatedAt: priceDoc.updatedAt,
    };
    if (price !== undefined) sendData.price = price;
    if (namshiPrice !== undefined) sendData.namshiPrice = namshiPrice;
    if (noonPrice !== undefined) sendData.noonPrice = noonPrice;
    if (minPrice !== undefined) sendData.minPrice = minPrice;
    if (maxPrice !== undefined) sendData.maxPrice = maxPrice;
    if (msrp !== undefined) sendData.msrp = msrp;
    if (purchasePrice !== undefined) sendData.purchasePrice = purchasePrice;
    if (pricePayload.amazonPrice !== undefined) sendData.amazonPrice = pricePayload.amazonPrice;

    return {
      ...sendData,
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

async function sendPriceBatch(priceUpdates, sellerId = null, batchId = null) {
  try {
    // Fire-and-forget — worker pushes to CE at its own rate limit pace
    await getCommerceProvider().putOfferPrice(priceUpdates, {
      sellerId,
      batchId,
      awaitResult: false,
    });
    return { success: true };
  } catch (err) {
    console.error('[sendPriceBatch] Failed to enqueue:', err.message);
    throw err;
  }
}

async function sendExtraDataPriceBatch(mariketPriceUpdates, sellerId = null, batchId = null) {
  try {
    // Fire-and-forget — worker pushes to CE at its own rate limit pace
    await getCommerceProvider().patchProductsExtraDataBulkForPrice(mariketPriceUpdates, {
      sellerId,
      batchId,
      awaitResult: false,
    });
    return { success: true };
  } catch (err) {
    console.error('[sendExtraDataPriceBatch] Failed to enqueue:', err.message);
    throw err;
  }
}

export const syncPriceToChannelEngine = async (sellerId) => {
  try {
    if (!ObjectId.isValid(sellerId)) {
      throw new Error('Invalid sellerId');
    }

    const escaped = ALLOWEDMARKETPLACES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const marketplaceRegex = new RegExp(`(^|,\\s*)(${escaped.join('|')})(?=\\s*,|$)`, 'i');

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
      { productSkuCode: 1, price: 1, namshiPrice: 1, noonPrice: 1 }
    )
      .lean()
      .cursor();

    let batch = [];
    let totalSynced = 0;
    let failedBatches = 0;
    const tasks = [];
    let extraPriceBatch = [];
    let extraPriceTotalSync = 0;

    for await (const product of cursor) {
      if (!product.productSkuCode) continue;

      batch.push({
        MerchantProductNo: product.productSkuCode,
        Price: product.price,
      });

      extraPriceBatch.push({
        MerchantProductNo: product.productSkuCode,
        Operations: [
          {
            Op: 'replace',
            Key: 'namshiPrice',
            Value: product.namshiPrice || product.price,
          },
          {
            Op: 'replace',
            Key: 'noonPrice',
            Value: product.noonPrice || product.price,
          },
        ],
      });
      if (batch.length >= BATCH_SIZE) {
        const payload = batch;
        batch = [];

        tasks.push(
          limit(() =>
            sendPriceBatch(payload, sellerId, `price-${sellerId}`)
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
      if (extraPriceBatch.length >= BATCH_SIZE) {
        const payload = extraPriceBatch;
        extraPriceBatch = [];

        tasks.push(
          limit(() =>
            sendExtraDataPriceBatch(payload, sellerId, `price-extra-${sellerId}`)
              .then(() => {
                extraPriceTotalSync += payload.length;
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
          sendPriceBatch(batch, sellerId, `price-${sellerId}`)
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

    if (extraPriceBatch.length) {
      tasks.push(
        limit(() =>
          sendExtraDataPriceBatch(extraPriceBatch, sellerId, `price-extra-${sellerId}`)
            .then(() => {
              extraPriceTotalSync += extraPriceBatch.length;
            })
            .catch((err) => {
              failedBatches++;
              console.error(`Batch failed (${extraPriceBatch.length} items):`, err.message);
            })
        )
      );
    }

    await updateSyncDate(sellerId, 'PRICE', Math.max(totalSynced, extraPriceTotalSync));

    // Await remaining tasks
    if (tasks.length) {
      await Promise.all(tasks);
    }

    return {
      success: failedBatches === 0,
      message: 'Price sync completed',
      totalSynced: Math.max(totalSynced, extraPriceTotalSync),
      failedBatches,
    };
  } catch (err) {
    console.error('Service syncProductPrice error:', err);
    throw err;
  }
};

export const upsertPricesForProducts = async ({ sellerId, productSkuCodes, batchSize, writeLimit }) => {
  if (!productSkuCodes?.length) return;

  const now = new Date();

  // 1. Fetch required product data
  const products = await Product.find(
    {
      sellerId,
      productSkuCode: { $in: productSkuCodes },
    },
    {
      _id: 1,
      sellerId: 1,
      productSkuCode: 1,
      price: 1,
      noonPrice: 1,
      namshiPrice: 1,
      amazonPrice: 1,
      minPrice: 1,
      maxPrice: 1,
      msrp: 1,
      purchasePrice: 1,
    }
  ).lean();

  if (!products.length) return;

  // 2. Build bulk operations
  const priceBulkOps = products.map((product) => ({
    updateOne: {
      filter: {
        sellerId: product.sellerId,
        productId: product._id,
      },
      update: {
        $setOnInsert: {
          productSkuCode: product.productSkuCode,
        },
        $set: {
          price: product.price,
          noonPrice: product.noonPrice,
          namshiPrice: product.namshiPrice,
          amazonPrice: product.amazonPrice ?? 0,
          minPrice: product.minPrice ?? undefined,
          maxPrice: product.maxPrice ?? undefined,
          msrp: product.msrp ?? undefined,
          purchasePrice: product.purchasePrice ?? undefined,
          lastSyncedAt: now,
        },
      },
      upsert: true,
    },
  }));

  // 3. Execute in batches with concurrency control
  const bulkTasks = [];
  for (let i = 0; i < priceBulkOps.length; i += batchSize) {
    const batch = priceBulkOps.slice(i, i + batchSize);

    bulkTasks.push(writeLimit(() => Price.bulkWrite(batch, { ordered: false })));
  }

  await Promise.all(bulkTasks);
};

export default {
  importPriceFromGoogleSheet,
  updateSingleProductPrice,
  importPriceFromCsvFile,
  syncPriceToChannelEngine,
  upsertPricesForProducts,
};
