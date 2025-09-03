import { config } from '#config/config.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { mapProductToChannelEngine } from '#helpers/ProductMapper.js';
import '#models/Category.js';
import Product from '#models/Product.js';
import { mapRowToProduct } from '#utils/mapRowToProduct.js'; // your row mapper
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_KEY, CHANNEL_ENGINE_BATCH_SIZE, CHANNEL_ENGINE_MAX_CONCURRENT } =
  config;

const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);
const MAX_RETRIES = 3;

const fetchProducts = async (query) => {
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = { isDeleted: false };
  const appliedFilters = {};

  // Status filter
  if (status !== undefined) {
    const statusBool = status.toString().toLowerCase() === 'true';
    filter.status = statusBool;
    appliedFilters.status = statusBool;
  }

  // Price filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) ((filter.price.$gte = Number(minPrice)), (appliedFilters.minPrice = Number(minPrice)));
    if (maxPrice) ((filter.price.$lte = Number(maxPrice)), (appliedFilters.maxPrice = Number(maxPrice)));
  }

  // Search filter
  // if (search) filter.$text = { $search: search };
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
  }
  // Sorting
  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  // Fetch total and products in parallel
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select('_id name status productSkuCode price msrp images currentStockCount createdAt categories')
      .populate('categories', '_id name slug')
      .lean(),
  ]);

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

export const updateProductStatus = async (ids, active) => {
  if (!ids?.length) return 0;
  const result = await Product.updateMany({ _id: { $in: ids }, status: { $ne: active } }, { $set: { status: active } });
  return result.modifiedCount || 0;
};

// 🔹 Retry helper with exponential backoff
const withRetry = async (fn, retries = MAX_RETRIES, delay = 1000) => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(`Retrying... (${MAX_RETRIES - retries + 1})`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
};

// 🔹 Push a single batch to CE
const pushBatch = async (batch, index) => {
  return withRetry(async () => {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`❌ CE API error (Batch ${index + 1}): ${response.status}`);
    }

    const data = await response.json();
    return (
      data.Content || {
        AcceptedCount: 0,
        RejectedCount: batch.length,
        ProductMessages: [],
      }
    );
  });
};

// 🔹 Fetch products from DB in batches
async function* fetchBatchesFromDB() {
  let skip = 0;
  while (true) {
    const products = await Product.find({ status: true }).skip(skip).limit(BATCH_SIZE).lean();
    if (!products.length) break;
    yield products.map(mapProductToChannelEngine);
    skip += BATCH_SIZE;
  }
}

// 🔹 Push all products to CE
export const pushProductsFromDB = async () => {
  const limit = pLimit(MAX_CONCURRENT);
  const results = [];

  let index = 0;
  for await (const batch of fetchBatchesFromDB()) {
    results.push(
      limit(async () => {
        try {
          return await pushBatch(batch, index);
        } catch (err) {
          console.error(`❌ Batch ${index + 1} failed permanently:`, err);
          return {
            AcceptedCount: 0,
            RejectedCount: batch.length,
            ProductMessages: [],
          };
        }
      })
    );
    index++;
  }

  // Wait for all limited promises to finish
  const settled = await Promise.allSettled(results);

  // 🔹 Merge results
  return settled.reduce(
    (acc, r) => {
      if (r.status === 'fulfilled') {
        acc.AcceptedCount += r.value.AcceptedCount;
        acc.RejectedCount += r.value.RejectedCount;
        acc.ProductMessages.push(...r.value.ProductMessages);
      }
      return acc;
    },
    { AcceptedCount: 0, RejectedCount: 0, ProductMessages: [] }
  );
};

const processImportStream = async (stream, { deleteAfter, filePath } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;
  let batch = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let invalidRowsCount = 0;
  let errorRows = [];
  const batchPromises = [];

  await new Promise((resolve, reject) => {
    let rowIndex = 1;

    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        try {
          // 1. Skip empty rows
          const isEmptyRow = Object.values(row).every(
            (val) => val === null || val === undefined || String(val).trim() === ''
          );
          if (isEmptyRow) {
            invalidRowsCount++;
            errorRows.push(rowIndex);
            return;
          }

          // 2. Map row
          const product = mapRowToProduct(row, rowIndex);

          if (!product.productSkuCode) {
            invalidRowsCount++;
            errorRows.push(rowIndex);
            return;
          }

          batch.push(product);

          // 3. If batch full → upsert
          if (batch.length >= batchSize) {
            const toProcess = [...batch];
            batch = [];

            const ops = toProcess.map((p) => ({
              updateOne: {
                filter: { productSkuCode: p.productSkuCode },
                update: { $set: p },
                upsert: true,
              },
            }));

            batchPromises.push(
              Product.bulkWrite(ops, { ordered: false })
                .then((res) => {
                  insertedCount += res.upsertedCount || 0;
                  updatedCount += res.modifiedCount || 0;
                  console.log(`Batch upsert: inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
                })
                .catch((err) => console.error('Batch upsert error:', err.message))
            );
          }
        } catch (err) {
          console.error(`Row ${rowIndex} error:`, err.message);
          invalidRowsCount++;
          errorRows.push(rowIndex);
        }
      })
      .on('end', async () => {
        try {
          if (batch.length) {
            const ops = batch.map((p) => ({
              updateOne: {
                filter: { productSkuCode: p.productSkuCode },
                update: { $set: p },
                upsert: true,
              },
            }));

            batchPromises.push(
              Product.bulkWrite(ops, { ordered: false })
                .then((res) => {
                  insertedCount += res.upsertedCount || 0;
                  updatedCount += res.modifiedCount || 0;
                  console.log(`Final upsert: inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
                })
                .catch((err) => console.error('Final batch upsert error:', err.message))
            );
          }

          await Promise.all(batchPromises);

          // Cleanup uploaded file if needed
          if (deleteAfter && filePath) {
            fs.unlinkSync(filePath);
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });

  return {
    success: true,
    message: `Imported ${insertedCount} new products, updated ${updatedCount}, skipped ${invalidRowsCount} invalid rows`,
    insertedCount,
    updatedCount,
    invalidRowsCount,
    errorRows,
  };
};

/* Google Sheet Import */
export const importProductsFromGoogleSheet = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processImportStream(stream);
  } catch (err) {
    console.error('Error in importProductsFromGoogleSheet:', err);
    return { success: false, message: err.message };
  }
};

/* CSV File Import */
export const importProductsFromCsvFile = async (filePath) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath });
  } catch (err) {
    console.error('Error in importProductsFromCsvFile:', err);
    return { success: false, message: err.message };
  }
};

const deleteProduct = async (prId) => {
  try {
    const result = await Product.findByIdAndUpdate(
      prId,
      { isDeleted: true },
      { new: true } // return updated doc
    );

    if (!result) {
      return { success: false, message: 'Product not found' };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error('Service error in saveUserChannels:', err);
    return { success: false, message: err.message };
  }
};

/* DELETE MULTIPLE PRODUCTS BY ID*/
const deleteMultipleProducts = async (ids) => {
  try {
    const result = await Product.updateMany(
      { _id: { $in: ids }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } }
    );

    if (result.modifiedCount === 0) {
      return { success: false, message: 'Product not found' };
    }

    return { success: true, message: `${result.modifiedCount} products marked as deleted successfully` };
  } catch (err) {
    console.error('Service error in deleteMultipleProducts:', err);
    return { success: false, message: err.message };
  }
};

export default {
  fetchProducts,
  pushProductsFromDB,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  deleteProduct,
  updateProductStatus,
  deleteMultipleProducts,
};
