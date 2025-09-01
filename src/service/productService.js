import Product from '#models/Product.js';
import '#models/Category.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { Readable } from 'stream';
import csv from 'csv-parser';
import fs from 'fs';
import { mapRowToProduct } from '#utils/mapRowToProduct.js'; // your row mapper

const fetchProducts = async (query) => {
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = 'createdAt', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = {};
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
/* UPLOAD PRODUCTS FROM GOOGLE SHEET */

export const uploadProductsFromGoogleSheet = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);

    const batchSize = Number(process.env.BATCH_SIZE) || 500;
    let batch = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let invalidRowsCount = 0;
    let errorRows = [];

    const batchPromises = [];

    await new Promise((resolve, reject) => {
      let rowIndex = 1;

      Readable.fromWeb(res.body)
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

            // Skip if no productSkuCode
            if (!product.productSkuCode) {
              invalidRowsCount++;
              errorRows.push(rowIndex);
              return;
            }

            batch.push(product);

            // 3. If batch full → process
            if (batch.length >= batchSize) {
              const toProcess = [...batch];
              batch = [];

              const ops = toProcess.map((product) => ({
                updateOne: {
                  filter: { productSkuCode: product.productSkuCode },
                  update: { $set: product },
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
            // Process final batch
            if (batch.length > 0) {
              const ops = batch.map((product) => ({
                updateOne: {
                  filter: { productSkuCode: product.productSkuCode },
                  update: { $set: product },
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
  } catch (err) {
    console.error('Error in importFromGoogleSheet:', err);
    return { success: false, message: err.message };
  }
};

/* UPLOAD PRODUCTS FROM CSV FILE */

export const uploadProductsFromCsvFile = async (filePath) => {
  try {
    const batchSize = Number(process.env.BATCH_SIZE) || 500;
    let batch = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let invalidRowsCount = 0;
    let errorRows = [];

    const batchPromises = [];

    await new Promise((resolve, reject) => {
      let rowIndex = 1;

      fs.createReadStream(filePath)
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

            // 2. Map row to product
            const product = mapRowToProduct(row, rowIndex);

            // Skip rows without productSkuCode
            if (!product.productSkuCode) {
              invalidRowsCount++;
              errorRows.push(rowIndex);
              return;
            }

            batch.push(product);

            // 3. If batch size reached → process
            if (batch.length >= batchSize) {
              const toProcess = [...batch];
              batch = [];

              const ops = toProcess.map((product) => ({
                updateOne: {
                  filter: { productSkuCode: product.productSkuCode },
                  update: { $set: product },
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
            console.error(`Row ${rowIndex} processing error:`, err.message);
            invalidRowsCount++;
            errorRows.push(rowIndex);
          }
        })
        .on('end', async () => {
          try {
            // Process final batch
            if (batch.length) {
              const ops = batch.map((product) => ({
                updateOne: {
                  filter: { productSkuCode: product.productSkuCode },
                  update: { $set: product },
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

            // Cleanup uploaded file
            fs.unlinkSync(filePath);

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
  } catch (err) {
    console.error('Error in uploadProductsFromCsvFile:', err);
    return { success: false, message: err.message };
  }
};
export default { fetchProducts, uploadProductsFromGoogleSheet, uploadProductsFromCsvFile };
