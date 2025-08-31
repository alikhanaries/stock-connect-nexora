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

    const batchSize = process.env.BATCH_SIZE || 500;
    let batch = [];
    let insertedCount = 0;
    let invalidRowsCount = 0;
    let errorRows = [];
    // Pre-fetch all existing EANs once
    const existingEans = new Set((await Product.find({}, { ean: 1 }).lean()).map((p) => p.ean));

    const batchPromises = [];

    await new Promise((resolve, reject) => {
      let rowIndex = 1;

      Readable.fromWeb(res.body)
        .pipe(csv())
        .on('data', (row) => {
          rowIndex++;

          // Skip empty rows
          const isEmptyRow = Object.values(row).every(
            (val) => val === null || val === undefined || String(val).trim() === ''
          );
          if (isEmptyRow) {
            errorRows.push(rowIndex);
            invalidRowsCount++;
            return;
          }

          const product = mapRowToProduct(row, rowIndex);

          // Skip if EAN exists
          if (!product.ean || existingEans.has(product.ean)) {
            invalidRowsCount++;
            errorRows.push(rowIndex);
            return;
          }

          existingEans.add(product.ean); // avoid duplicates in same CSV
          batch.push(product);

          if (batch.length >= batchSize) {
            const toInsert = [...batch];
            batch = [];

            // Insert in parallel without awaiting
            batchPromises.push(
              Product.insertMany(toInsert, { ordered: false })
                .then((res) => (insertedCount += res.length))
                .catch((err) => console.error('Batch insert error:', err.message))
            );
          }
        })
        .on('end', async () => {
          // Insert any remaining batch
          if (batch.length) {
            batchPromises.push(
              Product.insertMany(batch, { ordered: false })
                .then((res) => (insertedCount += res.length))
                .catch((err) => console.error('Final batch insert error:', err.message))
            );
          }

          // Wait for all batch inserts to finish in parallel
          await Promise.all(batchPromises);
          resolve();
        })
        .on('error', reject);
    });

    return {
      success: true,
      message: `Imported ${insertedCount} products, skipped ${invalidRowsCount} invalid/duplicate rows`,
      insertedCount,
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
    const batchSize = process.env.BATCH_SIZE || 500;
    let batch = [];
    let insertedCount = 0;
    let invalidRowsCount = 0;
    let errorRows = [];

    // Pre-fetch all existing EANs once
    const existingEans = new Set((await Product.find({}, { ean: 1 }).lean()).map((p) => p.ean));

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

            // 3. Skip duplicates
            if (!product.ean || existingEans.has(product.ean)) {
              invalidRowsCount++;
              errorRows.push(rowIndex);
              return;
            }

            existingEans.add(product.ean); // avoid dupes in same CSV
            batch.push(product);

            // 4. Batch insert
            if (batch.length >= batchSize) {
              const toInsert = [...batch];
              batch = [];

              batchPromises.push(
                Product.insertMany(toInsert, { ordered: false })
                  .then((res) => (insertedCount += res.length))
                  .catch((err) => console.error('Batch insert error:', err.message))
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
            // Insert any remaining batch
            if (batch.length) {
              batchPromises.push(
                Product.insertMany(batch, { ordered: false })
                  .then((res) => (insertedCount += res.length))
                  .catch((err) => console.error('Final batch insert error:', err.message))
              );
            }

            await Promise.all(batchPromises);

            // Cleanup file
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
      message: `Imported ${insertedCount} products, skipped ${invalidRowsCount} invalid/duplicate rows`,
      insertedCount,
      invalidRowsCount,
      errorRows,
    };
  } catch (err) {
    console.error('Error in uploadProductsFromCsvFile:', err);
    return { success: false, message: err.message };
  }
};
export default { fetchProducts, uploadProductsFromGoogleSheet, uploadProductsFromCsvFile };
