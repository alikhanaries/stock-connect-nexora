import { config } from '#config/config.js';
import { ORDER_STATUS_MATCH, PRODUCT_STATUSES } from '#constants/common.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { resolveProductTypes, validateHierarchy, validateHierarchyExistenceBatch } from '#helpers/ProductHierarchy.js';
import { mapProductToChannelEngine } from '#helpers/ProductMapper.js';
import { escapeCsv, validateExportData } from '#helpers/export.js';
import Channel from '#models/Channel.js';
import Order from '#models/Orders.js';
import Product from '#models/Product.js';
import Seller from '#models/Seller.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import { uploadProducts, buildBatchesKeepingParentsIntact, groupByParent } from '#service/channel/ocpService.js';
import { mapRowToProduct } from '#utils/mapRowToProduct.js';
import { buildFilter } from '#utils/buildFilter.js';
import csv from 'csv-parser';
import fs from 'fs';
import mongoose from 'mongoose';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { insertCategoryTrail } from '../service/categoryService.js';
import { buildCondition } from '../helpers/productFilters.js';
const {
  CHANNEL_ENGINE_BASE_URL,
  CHANNEL_ENGINE_API_KEY,
  CHANNEL_ENGINE_BATCH_SIZE,
  CHANNEL_ENGINE_MAX_CONCURRENT,
  OCP_URL,
  OCP_API_KEY,
} = config;

const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);
const MAX_RETRIES = 3;
const ROW_CONCURRENCY = 50;
const DB_WRITE_CONCURRENCY = 4;
const limit = pLimit(ROW_CONCURRENCY);
const writeLimit = pLimit(DB_WRITE_CONCURRENCY);

const fetchProducts = async (query, sellerId) => {
  const {
    page = 1,
    size = 10,
    status,
    productSkuCode,
    minPrice,
    maxPrice,
    search,
    sortBy = 'createdAt',
    sortOrder = 'asc',
    productType,
    minStockCount,
    maxStockCount,
  } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = { status: { $ne: 'removed' }, sellerId: new mongoose.Types.ObjectId(sellerId) };

  const appliedFilters = {};

  // Status filter
  if (status) {
    const statusValue = status.toString().trim().toLowerCase();
    if (PRODUCT_STATUSES.includes(statusValue)) {
      filter.status = statusValue;
      appliedFilters.status = statusValue;
    }
  }
  if (productSkuCode) {
    filter.productSkuCode = productSkuCode;
    appliedFilters.productSkuCode = productSkuCode;
  }

  // Price filter
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) ((filter.price.$gte = Number(minPrice)), (appliedFilters.minPrice = Number(minPrice)));
    if (maxPrice) ((filter.price.$lte = Number(maxPrice)), (appliedFilters.maxPrice = Number(maxPrice)));
  }

  // Product type filter
  if (productType) {
    const productTypes = String(productType)
      .toLowerCase()
      .split(',')
      .map((t) => t.trim().replace(/'/g, ''));

    filter.productType = { $in: productTypes };
    appliedFilters.productType = productTypes;
  }

  //stock count filter
  if (minStockCount || maxStockCount) {
    filter.currentStockCount = {};
    if (minStockCount)
      ((filter.currentStockCount.$gte = Number(minStockCount)), (appliedFilters.minStockCount = Number(minStockCount)));
    if (maxStockCount)
      ((filter.currentStockCount.$lte = Number(maxStockCount)), (appliedFilters.maxStockCount = Number(maxStockCount)));
  }

  // Search filter
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
  }
  // Sorting
  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1, _id: 1 };
  // Fetch total and products in parallel
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select('_id name status productSkuCode price msrp primaryImageUrl currentStockCount createdAt sellerId')
      .lean(),
  ]);

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

const getTopSellingProduct = async (limit, channelNameSearch) => {
  const filter = {
    status: { $in: ORDER_STATUS_MATCH },
  };
  if (channelNameSearch) {
    const searchRegex = new RegExp(channelNameSearch, 'i');
    filter.channelName = searchRegex;
  }

  const topProducts = await Order.aggregate([
    { $match: filter },
    {
      $project: {
        _id: 0,
        channelName: 1,
        orderSkuList: '$orderSkuList.skuList',
      },
    },
    { $unwind: '$orderSkuList' },

    {
      $group: {
        _id: '$orderSkuList.merchantProductNo',
        totalQuantitySold: { $sum: '$orderSkuList.quantity' },
        channelName: { $first: '$channelName' },
      },
    },

    { $sort: { totalQuantitySold: -1 } },

    { $limit: limit },

    {
      $lookup: {
        from: Product.collection.name,
        localField: '_id',
        foreignField: 'productSkuCode',
        as: 'productDetails',
      },
    },
    {
      $unwind: '$productDetails',
    },

    {
      $project: {
        _id: '$productDetails._id',
        sku: '$_id',
        totalQuantitySold: 1,
        channelName: 1,
        productName: '$productDetails.name',
        primaryImageUrl: '$productDetails.primaryImageUrl',
      },
    },
  ]).allowDiskUse(true);
  return topProducts;
};

export const updateProductStatus = async (ids, status, sellerId) => {
  if (!ids?.length) return 0;
  const filter = {
    _id: { $in: ids },
    sellerId: sellerId,
    status: { $ne: status },
  };

  const result = await Product.updateMany(filter, {
    $set: { status: status },
  });
  return result.modifiedCount || 0;
};

export const freezeOrUnfreezeProducts = async (ids, isFrozen, sellerId) => {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const filter = {
    _id: { $in: ids },
    sellerId,
    isFrozen: { $ne: isFrozen },
  };
  const result = await Product.updateMany(filter, { $set: { isFrozen, updatedAt: new Date() } });
  return result.modifiedCount ?? 0;
};

// Retry helper with exponential backoff
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

// Push a single batch to CE
const pushBatch = async (batch, index) => {
  return withRetry(async () => {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`CE API error (Batch ${index + 1}): ${response.status}`);
    const data = await response.json();
    return data.Content;
  });
};

export const pushBatchToOCP = async (batch, index, sellerId) => {
  const seller = await Seller.findById(sellerId).exec();
  if (!seller) {
    throw new Error(`Seller with ID ${sellerId} not found`);
  }
  return withRetry(async () => {
    const response = await fetch(`${OCP_URL}/api/v1/edge/import-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ocp-tenant-slug': seller.ocpSlugId,
        'x-api-key': OCP_API_KEY,
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) throw new Error(`OCP API error (Batch ${index + 1}): ${response.status}`);

    return response.json();
  });
};

//  Validate products
const validateProducts = async (channelId, sellerId) => {
  // Get all SKU codes linked to the channel
  const channelProducts = await UserChannelProducts.find(
    { sellerId, channelId },
    { 'skuList.skuCode': 1, _id: 0 }
  ).lean();

  const skuCodes = channelProducts.flatMap((cp) => cp.skuList.map((s) => s.skuCode));
  if (!skuCodes.length) return { validProducts: [] };

  // Get products for those SKUs (child products)
  const childProducts = await Product.find({
    sellerId,
    productSkuCode: { $in: skuCodes },
    status: 'active',
  }).lean();

  // Collect parent SKUs from child products
  const parentSkuCodes = new Set();
  for (const p of childProducts) {
    if (p.parentProductSkuCode) parentSkuCodes.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) parentSkuCodes.add(p.grandParentProductSkuCode);
  }

  // Fetch parent products
  const parentProducts = await Product.find({
    sellerId,
    productSkuCode: { $in: Array.from(parentSkuCodes) },
    status: 'active',
  }).lean();

  // Check if those parents have any grandparent
  const grandParentSkuCodes = new Set();
  for (const p of parentProducts) {
    if (p.grandParentProductSkuCode) grandParentSkuCodes.add(p.grandParentProductSkuCode);
  }

  // Fetch grandparent products (if any)
  let grandParentProducts = [];
  if (grandParentSkuCodes.size > 0) {
    grandParentProducts = await Product.find({
      sellerId,
      productSkuCode: { $in: Array.from(grandParentSkuCodes) },
      status: 'active',
    }).lean();
  }

  // Combine all (child + parent + grandparent) — remove duplicates
  const allProductsMap = new Map();
  [...childProducts, ...parentProducts, ...grandParentProducts].forEach((p) => {
    allProductsMap.set(p.productSkuCode, p);
  });
  const validatedProducts = Array.from(allProductsMap.values());

  return {
    validProducts: validatedProducts,
  };
};

export const pushProductsAsync = async (products, channelId, sellerId) => {
  const channel = await Channel.findOne({ channelId });

  if (!channel) {
    throw new Error(`Channel with ID ${channelId} not found`);
  }

  const limit = pLimit(MAX_CONCURRENT);
  let batches = [];

  if (channel.channelName === 'OCP') {
    const simpleProducts = products
      .filter(({ productType }) => productType === 'simple')
      .map((product) =>
        product.categoryTrail === 'Apparel > Dresses > Dresses'
          ? { ...product, categoryTrail: 'Apparel > Dresses > Dress' }
          : product
      );

    const groupedByParent = groupByParent(simpleProducts);
    batches = buildBatchesKeepingParentsIntact(groupedByParent, BATCH_SIZE);
  } else {
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE));
    }
  }

  await Promise.allSettled(
    batches.map((batch, idx) =>
      limit(async () => {
        try {
          if (channel.channelName === 'OCP') {
            return await pushBatchToOCP(uploadProducts(batch), idx, sellerId);
          }

          return await pushBatch(batch.map(mapProductToChannelEngine), idx);
        } catch (err) {
          console.error(`Batch ${idx} push failed`, err);

          return {
            AcceptedCount: 0,
            RejectedCount: batch.length,
            ProductMessages: batch.map((p) => ({
              Name: p.name,
              Reference: p.productSkuCode,
              Errors: [err.message],
              Warnings: p.Warnings,
            })),
          };
        }
      })
    )
  );
};
export const processImportStream = async (stream, { deleteAfter, filePath, locale, sellerId, isImageUpdate } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;
  const errorDetails = [];
  const parsedRows = [];
  const parsedProducts = [];
  const categoryTrailsSet = new Set();
  let invalidRowsCount = 0;
  let rowIndex = 1;

  const incomingSkuSet = new Set();
  const rowTasks = [];

  await new Promise((resolve, reject) => {
    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        const currentRow = rowIndex;

        rowTasks.push(
          limit(async () => {
            try {
              // Skip empty rows
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

              parsedRows.push({ row, rowNumber: currentRow });
            } catch (err) {
              console.error('Row read error:', err.message);
              invalidRowsCount++;
            }
          })
        );
      })
      .on('end', resolve)
      .on('error', reject);
  });
  await Promise.all(rowTasks);
  const existingProducts = await Product.find(
    { sellerId, productSkuCode: { $in: [...incomingSkuSet] } },
    { productSkuCode: 1 }
  ).lean();

  const existingSkuSet = new Set(existingProducts.map((p) => p.productSkuCode));
  for (const { row, rowNumber } of parsedRows) {
    try {
      const sku = row.ProductSkuCode;
      const normalizedSku = String(sku).trim();
      const isNewSku = !existingSkuSet.has(normalizedSku);
      const product = await mapRowToProduct(row, rowNumber, locale, sellerId, isImageUpdate, isNewSku);
      if (product?.errorData) {
        errorDetails.push(product);
        invalidRowsCount++;
        continue;
      }

      // Basic hierarchy validation
      const { valid, errors } = validateHierarchy(product);
      if (!valid) {
        errorDetails.push({
          rowNumber,
          errorData: errors,
        });
        invalidRowsCount++;
        continue;
      }

      parsedProducts.push(product);
    } catch (err) {
      console.error('Row error:', err.message);
      invalidRowsCount++;
    }
  }
  const { validated, errors: hierarchyErrors } = await validateHierarchyExistenceBatch(parsedProducts, sellerId);

  if (hierarchyErrors.length) {
    errorDetails.push(...hierarchyErrors);
    invalidRowsCount += hierarchyErrors.length;
  }

  const validProducts = validated.filter((v) => v.valid).map((v) => v.product);

  const referencedSKUs = new Set();

  // From current import file
  for (const p of parsedProducts) {
    if (p.parentProductSkuCode) referencedSKUs.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) referencedSKUs.add(p.grandParentProductSkuCode);
  }

  // From database (single query)
  const dbRefs = await Product.find({ sellerId }, { parentProductSkuCode: 1, grandParentProductSkuCode: 1 }).lean();

  for (const p of dbRefs) {
    if (p.parentProductSkuCode) referencedSKUs.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) referencedSKUs.add(p.grandParentProductSkuCode);
  }

  const finalValidProducts = [];

  for (const product of validProducts) {
    const rowErrors = [];

    // FINAL & CORRECT simple-product detection
    const isSimple = !referencedSKUs.has(product.productSkuCode);
    const isNewSku = !existingSkuSet.has(product.productSkuCode);

    if (isNewSku && isSimple) {
      if (typeof product.price !== 'number' || product.price <= 0) {
        rowErrors.push('Price must be greater than 0 for simple products.');
      }

      if (typeof product.currentStockCount !== 'number' || product.currentStockCount <= 0) {
        rowErrors.push('Stock must be greater than 0 for simple products.');
      }
    }

    if (rowErrors.length) {
      errorDetails.push({
        rowNumber: product.rowNumber,
        errorData: rowErrors,
      });
      invalidRowsCount++;
      continue;
    }

    finalValidProducts.push(product);
  }

  const productSkuCodes = finalValidProducts.map((p) => p.productSkuCode);

  const existingMap = new Map(
    (
      await Product.find(
        { sellerId, productSkuCode: { $in: productSkuCodes } },
        { productSkuCode: 1, status: 1 }
      ).lean()
    ).map((p) => [p.productSkuCode, p])
  );
  // Counters
  let insertedCount = 0;
  let updatedCount = 0;

  // Prepare bulk write operations
  const bulkOps = finalValidProducts.map((product) => {
    const existing = existingMap.get(product.productSkuCode);

    if (existing?.status === 'removed') {
      product.status = 'active';
    }

    if (existing) updatedCount++;
    else insertedCount++;

    if (product.categoryTrail) {
      categoryTrailsSet.add(product.categoryTrail);
    }

    return {
      updateOne: {
        filter: {
          sellerId,
          productSkuCode: product.productSkuCode,
        },
        update: { $set: product },
        upsert: true,
      },
    };
  });

  // Bulk writes in parallel batches
  const bulkTasks = [];
  for (let i = 0; i < bulkOps.length; i += batchSize) {
    bulkTasks.push(
      writeLimit(() =>
        Product.bulkWrite(bulkOps.slice(i, i + batchSize), {
          ordered: false,
        })
      )
    );
  }
  await Promise.all(bulkTasks);

  // Delete file async (non-blocking)
  if (deleteAfter && filePath) {
    fs.unlink(filePath, (err) => {
      if (err) console.warn('File cleanup failed:', err.message);
    });
  }

  //  Update categories – fire & forget (NO WAIT)
  if (categoryTrailsSet.size) {
    insertCategoryTrail([...categoryTrailsSet], sellerId).catch((e) =>
      console.warn('CategoryTrail update error:', e.message)
    );
  }

  // Resolve product types (non-critical)
  await resolveProductTypes(sellerId);

  return {
    success: true,
    message: `Imported ${insertedCount} new products, updated ${updatedCount}, skipped ${invalidRowsCount} invalid rows`,
    insertedCount,
    updatedCount,
    invalidRowsCount,
    errorDetails,
  };
};

/* Google Sheet Import */

export const importProductsFromGoogleSheet = async (url, locale, sellerId, isImageUpdate) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processImportStream(stream, { locale, sellerId, isImageUpdate });
  } catch (err) {
    console.error('Error in importProductsFromGoogleSheet:', err);
    throw new Error(err.message); // force the catch block
  }
};

/* CSV File Import */

export const importProductsFromCsvFile = async (filePath, locale, sellerId, isImageUpdate) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath, locale, sellerId, isImageUpdate });
  } catch (err) {
    console.error('Error in importProductsFromCsvFile:', err);
    throw new Error(err.message); // force the catch block
  }
};

const deleteProduct = async (id, locale, sellerId) => {
  try {
    const result = await Product.findOneAndUpdate(
      { _id: id, sellerId: sellerId },
      { $set: { status: 'removed' } },
      { new: true }
    );

    if (!result) {
      return { success: false, message: locale?.PRODUCT_NOT_FOUND };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error('Service error in saveUserChannels:', err);
    throw new Error(err.message); // force the catch block
  }
};

const getProductById = async (id, locale) => {
  const product = await Product.findOne({ _id: id, status: { $ne: 'removed' } })
    .select('-__v')
    .lean();

  if (!product) return { success: false, message: locale?.PRODUCT_NOT_FOUND };

  const rootSku = product.grandParentProductSkuCode || product.parentProductSkuCode || product.productSkuCode;

  const relatedProducts = await Product.find({
    status: { $ne: 'removed' },
    $or: [
      { productSkuCode: rootSku },
      { parentProductSkuCode: rootSku },
      { grandParentProductSkuCode: rootSku },
      { productSkuCode: { $regex: `^${rootSku.split('-')[0].replace(/[.*+?^${}()|[]\]/g, '//$&')}` } },
    ],
  })
    .select('-__v')
    .lean();

  if (!relatedProducts.length) {
    return { success: false, message: locale?.PRODUCT_NOT_FOUND };
  }

  const map = {};
  relatedProducts.forEach((p) => {
    map[p.productSkuCode] = { ...p, children: [] };
  });

  Object.values(map).forEach((node) => {
    if (node.parentProductSkuCode && map[node.parentProductSkuCode]) {
      map[node.parentProductSkuCode].children.push(node);
    } else if (node.grandParentProductSkuCode && map[node.grandParentProductSkuCode]) {
      map[node.grandParentProductSkuCode].children.push(node);
    }
  });

  let root = map[rootSku] || map[product.productSkuCode];
  let safety = 0;
  while (root && safety < 10) {
    safety++;
    const parent = map[root.parentProductSkuCode];
    const grand = map[root.grandParentProductSkuCode];

    if (parent) root = parent;
    else if (grand) root = grand;
    else break;
  }

  const formatNode = (node) => ({
    id: node._id,
    name: node.name,
    sku: node.productSkuCode,
    price: node.price,
    type: node.parentProductSkuCode ? 'child' : node.grandParentProductSkuCode ? 'parent' : 'grandparent',
    barcode: node.ean,
    children: node.children.map(formatNode),
  });

  return {
    success: true,
    message: locale?.PRODUCT_FETCH_SUCCESS,
    data: {
      ...product,
      variations: [formatNode(root)],
    },
  };
};

/* DELETE MULTIPLE PRODUCTS BY ID*/
const deleteMultipleProducts = async (ids, locale, sellerId) => {
  try {
    const filter = {
      _id: { $in: ids },
      sellerId: sellerId,
      status: { $ne: 'removed' },
    };
    const result = await Product.updateMany(filter, { $set: { status: 'removed' } });

    if (result.modifiedCount === 0) {
      return { success: false, message: locale?.PRODUCT_NOT_FOUND };
    }
    await removeSkuFromUserChannelProducts(sellerId, ids);
    return {
      success: true,
      message: `${result.modifiedCount} ${locale?.PRODUCT_MARKED_DELETED}`,
    };
  } catch (err) {
    console.error('Service error in deleteMultipleProducts:', err);
    throw new Error(err.message); // force the catch block
  }
};
/* GET ALL PRODUCT IDS BY SELLER ID */
const getAllProductIdsBySellerId = async (sellerId) => {
  try {
    const products = await Product.find(
      {
        sellerId: new mongoose.Types.ObjectId(sellerId),
        status: { $nin: ['removed', 'inactive'] },
      },
      { _id: 1 }
    ).lean();

    return products.map((p) => p._id.toString());
  } catch (err) {
    console.error('Service error in getAllProductIdsBySellerId:', err);
    throw new Error(err.message);
  }
};

/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
const addProductsToUserChannel = async (sellerId, channelId, productIds, locale) => {
  try {
    const products = await Product.find(
      { _id: { $in: productIds } },
      { productSkuId: 1, productSkuCode: 1, marketPlace: 1 }
    ).lean();

    if (products.length !== productIds.length) {
      return { success: false, message: locale.PRODUCT_NOT_EXITS };
    }
    const skuList = products.map((p) => ({
      skuId: p.productSkuId,
      skuCode: p.productSkuCode,
    }));
    if (!skuList.length) {
      return { success: false, message: locale.INVALID_PRODUCTS };
    }
    const channel = await Channel.findOne({ channelId }).select('channelName').lean();
    if (!channel) {
      return { success: false, message: locale.CHANNEL_NOT_FOUND };
    }
    const channelName = channel.channelName;
    await UserChannelProducts.findOneAndUpdate(
      { sellerId, channelId },
      { $addToSet: { skuList: { $each: skuList } } },
      { upsert: true }
    );
    const bulkOps = products.map((p) => {
      const existing = p.marketPlace ? p.marketPlace.split(',').map((s) => s.trim()) : [];
      if (!existing.includes(channelName)) {
        existing.push(channelName);
      }
      return {
        updateOne: {
          filter: { _id: p._id, sellerId },
          update: { $set: { marketPlace: existing.join(', ') } },
        },
      };
    });

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    return { success: true };
  } catch (err) {
    console.error('Service error in addProductsToUserChannel:', err);
    throw new Error(err.message);
  }
};

export const getUserChannelProducts = async (sellerId, channelId, query) => {
  const rawFilters = query.filter ? (Array.isArray(query.filter) ? query.filter : [query.filter]) : [];

  const baseFilter = buildFilter({
    rawFilters,
    sellerId,
    buildCondition,
  });

  const {
    page = 1,
    size = 10,
    search,
    sortBy = 'name',
    sortOrder = 'asc',
    status,
    minPrice,
    maxPrice,
    productType,
  } = query;
  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const appliedFilters = {};

  const matchStage = {
    sellerId: new mongoose.Types.ObjectId(sellerId),
    channelId: Number(channelId),
  };

  const channelDetails = await Channel.findOne(
    { channelId: Number(channelId) },
    { channelId: 1, channelName: 1, _id: 0 }
  ).lean();

  const pipeline = [
    { $match: matchStage },
    { $unwind: '$skuList' },
    {
      $lookup: {
        from: 'products',
        localField: 'skuList.skuCode',
        foreignField: 'productSkuCode',
        as: 'productDetails',
      },
    },
    { $unwind: '$productDetails' },
  ];
  const productLevelFilter = {};

  for (const key in baseFilter) {
    if (key === '$or' || key === '$and') {
      productLevelFilter[key] = baseFilter[key].map((cond) => {
        const field = Object.keys(cond)[0];
        return { [`productDetails.${field}`]: cond[field] };
      });
    } else if (!['sellerId', 'channelId'].includes(key)) {
      productLevelFilter[`productDetails.${key}`] = baseFilter[key];
    }
  }

  if (Object.keys(productLevelFilter).length) {
    pipeline.push({ $match: productLevelFilter });
  }

  const matchProductStage = { 'productDetails.status': { $ne: 'removed' } };

  if (status) {
    const statusValue = status.toString().trim().toLowerCase();
    if (PRODUCT_STATUSES.includes(statusValue)) {
      matchProductStage['productDetails.status'] = statusValue;
      appliedFilters.status = statusValue;
    }
  }

  if (productType) {
    const productTypes = String(productType)
      .toLowerCase()
      .split(',')
      .map((t) => t.trim().replace(/'/g, ''));
    matchProductStage['productDetails.productType'] = { $in: productTypes };
    appliedFilters.productType = productTypes;
  }

  if (minPrice || maxPrice) {
    matchProductStage['productDetails.price'] = {};
    if (minPrice) matchProductStage['productDetails.price'].$gte = Number(minPrice);
    if (maxPrice) matchProductStage['productDetails.price'].$lte = Number(maxPrice);
    if (minPrice) appliedFilters.minPrice = Number(minPrice);
    if (maxPrice) appliedFilters.maxPrice = Number(maxPrice);
  }

  if (search && search.trim() !== '') {
    const regex = new RegExp(search, 'i');
    matchProductStage.$or = [
      { 'productDetails.name': regex },
      { 'skuList.skuCode': regex },
      { 'productDetails.productSkuCode': regex },
    ];
    appliedFilters.search = search;
  }

  pipeline.push({ $match: matchProductStage });

  const ALLOWED_SORT_FIELDS = ['_id', 'name', 'price', 'createdAt', 'status'];
  const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'name';

  const sortStage = {
    $sort: { [`productDetails.${safeSortBy}`]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 },
  };

  pipeline.push({
    $facet: {
      paginatedResults: [
        sortStage, // <-- SORT MOVED HERE ✔
        { $skip: (currentPage - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: '$productDetails._id',
            name: '$productDetails.name',
            productSkuCode: '$productDetails.productSkuCode',
            price: '$productDetails.price',
            msrp: '$productDetails.msrp',
            status: '$productDetails.status',
            primaryImageUrl: '$productDetails.primaryImageUrl',
            currentStockCount: '$productDetails.currentStockCount',
            createdAt: '$productDetails.createdAt',
          },
        },
      ],
      totalCount: [{ $count: 'count' }],
    },
  });

  const result = await UserChannelProducts.aggregate(pipeline, {
    allowDiskUse: true,
    collation: { locale: 'en', strength: 2 },
  });
  const total = result[0]?.totalCount[0]?.count || 0;
  const products = result[0]?.paginatedResults || [];

  return {
    channel: channelDetails,
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

const getUserUnassignedProducts = async (sellerId, channelId, query) => {
  const {
    page = 1,
    size = 10,
    status,
    minPrice,
    maxPrice,
    search,
    sortBy = '_id',
    sortOrder = 'asc',
    productType,
  } = query;
  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const appliedFilters = {};
  const assignedSku = await UserChannelProducts.findOne(
    {
      sellerId: new mongoose.Types.ObjectId(sellerId),
      channelId: Number(channelId),
      isActive: true,
    },
    { 'skuList.skuCode': 1 }
  ).lean();
  const assignedSkuCodes = assignedSku?.skuList?.map((s) => s.skuCode) || [];
  const filter = { status: { $nin: ['removed', 'inactive'] }, sellerId: new mongoose.Types.ObjectId(sellerId) };

  if (assignedSkuCodes.length > 0) {
    filter.productSkuCode = { $nin: assignedSkuCodes };
  }

  if (status) {
    const statusValue = status.toString().trim().toLowerCase();
    if (PRODUCT_STATUSES.includes(statusValue)) {
      filter.status = statusValue;
      appliedFilters.status = statusValue;
    }
  }

  if (productType) {
    const productTypes = String(productType)
      .toLowerCase()
      .split(',')
      .map((t) => t.trim().replace(/'/g, ''));

    filter.productType = { $in: productTypes };
    appliedFilters.productType = productTypes;
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) {
      filter.price.$gte = Number(minPrice);
      appliedFilters.minPrice = Number(minPrice);
    }
    if (maxPrice) {
      filter.price.$lte = Number(maxPrice);
      appliedFilters.maxPrice = Number(maxPrice);
    }
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
    appliedFilters.search = search;
  }

  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort(sort)
    .skip((currentPage - 1) * limit)
    .limit(limit)
    .select('_id name status productSkuCode price msrp primaryImageUrl')
    .lean();

  return {
    products,
    total,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

async function existProductsFromChannelEngine() {
  const page = 1;
  const batchSize = 500;

  try {
    const response = await fetch(
      `${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_API_KEY}&page=${page}&size=${batchSize}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`ChannelEngine GET failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.Content) return [];

    return data.Content.map((p) => p.MerchantProductNo?.trim().toUpperCase()).filter(Boolean);
  } catch (err) {
    console.error('Error fetching from ChannelEngine:', err);
    return [];
  }
}

async function removeProductsFromChannelEngine(skuCodes) {
  if (!skuCodes?.length) return { success: true, message: 'No SKUs provided' };

  try {
    const response = await fetch(`${CHANNEL_ENGINE_BASE_URL}products/bulkdelete?apiKey=${CHANNEL_ENGINE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skuCodes),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ChannelEngine bulkdelete failed:', errorText);
      return { success: false, message: errorText };
    }

    return { success: true };
  } catch (err) {
    console.error('Error calling ChannelEngine:', err);
    return { success: false, message: err.message };
  }
}

const unlinkProductFromChannel = async (sellerId, channelId, ids, locale) => {
  /**
   * TODO [TEMPORARY EXCLUSION - CE/NOON]:
   * These SKUs are temporarily restricted from unlinking/removal.
   * Reason: Avoid accidental deletion during ongoing ChannelEngine and Noon integrations.
   * Remove this list and all related conditions once integrations are fully completed.
   */
  const EXCLUDED_SKUS = new Set([
    'SKU-BLAZER-010-BLU',
    'SKU-BLAZER-011-BRN',
    'SKU-BLAZER-012-GRN',
    'SKU-BLAZER-011-PINK',
  ]);
  try {
    const products = await Product.find(
      { _id: { $in: ids }, sellerId: new mongoose.Types.ObjectId(sellerId) },
      { productSkuCode: 1, marketPlace: 1 }
    ).lean();
    if (!products.length) return 0;
    const skuCodes = products.map((p) => p.productSkuCode);
    const existProductFromCE = await existProductsFromChannelEngine();
    /**
     * TODO [TEMPORARY FILTER - CE/NOON]:
     * Filtering out temporarily restricted SKUs before CE unlinking.
     */
    const commonSkuCodes = skuCodes.filter((sku) => existProductFromCE.includes(sku) && !EXCLUDED_SKUS.has(sku));
    if (commonSkuCodes.length > 0) {
      const ceResult = await removeProductsFromChannelEngine(commonSkuCodes);
      if (!ceResult.success) {
        return {
          success: false,
          message: 'ChannelEngine deletion failed',
          ceError: ceResult.message,
        };
      }
    } else {
      console.log('No valid SKUs to remove from ChannelEngine');
    }
    /**
     * TODO [TEMPORARY FILTER - CE/NOON]:
     * Excluding temporary SKUs from DB update operations.
     */
    const validSkuCodes = skuCodes.filter((sku) => !EXCLUDED_SKUS.has(sku));
    if (!validSkuCodes.length) {
      return { success: true, message: 'No valid SKUs to process' };
    }
    const result = await UserChannelProducts.updateMany(
      {
        sellerId: new mongoose.Types.ObjectId(sellerId),
        channelId: Number(channelId),
      },
      { $pull: { skuList: { skuCode: { $in: validSkuCodes } } } }
    );

    const channel = await Channel.findOne({ channelId }).select('channelName').lean();
    if (!channel) {
      return { success: false, message: locale?.NO_CHANNEL_FOUND };
    }
    const channelName = channel.channelName;

    const bulkOps = products
      .map((p) => {
        if (!p.marketPlace) return null;

        const updatedList = p.marketPlace
          .split(',')
          .map((s) => s.trim())
          .filter((name) => name && name !== channelName);

        return {
          updateOne: {
            filter: { _id: p._id, sellerId: new mongoose.Types.ObjectId(sellerId) },
            update: updatedList.length
              ? { $set: { marketPlace: updatedList.join(', ') } }
              : { $set: { marketPlace: null } },
          },
        };
      })
      .filter(Boolean);

    if (bulkOps.length) {
      await Product.bulkWrite(bulkOps);
    }
    return result.modifiedCount || 0;
  } catch (err) {
    console.error('Service error in unlinkProductFromChannel:', err);
    throw new Error(err.message);
  }
};

export const removeSkuFromUserChannelProducts = async (sellerId, productIds) => {
  try {
    if (!sellerId || !Array.isArray(productIds) || productIds.length === 0) {
      console.warn('Invalid sellerId or productIds in removeSkuFromUserChannelProducts');
      return;
    }

    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

    const products = await Product.find(
      { _id: { $in: productIds }, sellerId: sellerObjectId },
      { productSkuCode: 1 }
    ).lean();

    if (!products?.length) return;

    const skuCodes = products.map((p) => p.productSkuCode).filter(Boolean);
    if (!skuCodes.length) return;

    await UserChannelProducts.updateMany(
      { sellerId: sellerObjectId },
      { $pull: { skuList: { skuCode: { $in: skuCodes } } } }
    );
  } catch (error) {
    console.error('Error in removeSkuFromUserChannelProducts:', error);
  }
};

export const validateProductExportData = async (filters, sellerId) => {
  try {
    // Parse filters if they're strings
    if (Array.isArray(filters) && typeof filters[0] === 'string') {
      filters = [
        {
          conditions: filters.map((f) => {
            const [field, operator, ...rest] = f.split(':');
            return {
              field,
              operator,
              value: rest.join(':'),
            };
          }),
        },
      ];
    }

    const orQueries = [];

    for (const group of filters) {
      if (!Array.isArray(group.conditions) || group.conditions.length === 0) continue;

      const andQueries = [];

      for (const cond of group.conditions) {
        const built = buildCondition(cond.field, cond.operator, cond.value);
        if (built && Object.keys(built).length) {
          andQueries.push(built);
        }
      }

      if (andQueries.length === 1) {
        orQueries.push(andQueries[0]);
      } else if (andQueries.length > 1) {
        orQueries.push({ $and: andQueries });
      }
    }

    let finalFilter = {};

    if (orQueries.length === 1) finalFilter = orQueries[0];
    else if (orQueries.length > 1) finalFilter = { $or: orQueries };

    finalFilter = {
      ...finalFilter,
      sellerId: new mongoose.Types.ObjectId(sellerId),
      status: { $ne: 'removed' },
    };

    const products = await Product.find(finalFilter).select('_id').limit(1).lean();

    return validateExportData(products, 'products');
  } catch (error) {
    console.error('Error in validateProductExportData:', error);
    return { success: false, message: error.message };
  }
};

export const exportProductsToCSV = async (filters, sellerId, query, res) => {
  let cursor = null;

  try {
    const { sortBy = 'createdAt', sortOrder = 'asc' } = query;

    // Parse filters if they're strings
    if (Array.isArray(filters) && typeof filters[0] === 'string') {
      filters = [
        {
          conditions: filters.map((f) => {
            const [field, operator, ...rest] = f.split(':');
            return {
              field,
              operator,
              value: rest.join(':'),
            };
          }),
        },
      ];
    }

    const orQueries = [];

    for (const group of filters) {
      if (!Array.isArray(group.conditions) || group.conditions.length === 0) continue;

      const andQueries = [];

      for (const cond of group.conditions) {
        const built = buildCondition(cond.field, cond.operator, cond.value);
        if (built && Object.keys(built).length) {
          andQueries.push(built);
        }
      }

      if (andQueries.length === 1) {
        orQueries.push(andQueries[0]);
      } else if (andQueries.length > 1) {
        orQueries.push({ $and: andQueries });
      }
    }

    let finalFilter = {};

    if (orQueries.length === 1) finalFilter = orQueries[0];
    else if (orQueries.length > 1) finalFilter = { $or: orQueries };

    finalFilter = {
      ...finalFilter,
      sellerId: new mongoose.Types.ObjectId(sellerId),
      status: { $ne: 'removed' },
    };

    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    // Use cursor to stream data batch by batch
    cursor = Product.find(finalFilter).sort(sort).lean().cursor();

    // Process products one by one using cursor
    for await (const product of cursor) {
      const row = [
        product.grandParentProductSkuCode || '',
        product.parentProductSkuCode || '',
        product.productSkuCode || '',
        product.brand || '',
        product.categoryTrail || '',
        product.color || '',
        product.currentStockCount || 0,
        product.description || '',
        product.descriptionAr || '',
        product.ean || '',
        product.extraImageUrl1 || '',
        product.extraImageUrl2 || '',
        product.extraImageUrl3 || '',
        product.gender || '',
        product.hsCodeSA || '',
        product.hsCodeAE || '',
        product.imageUrl || '',
        product.extraImageUrl1 || '',
        product.extraImageUrl2 || '',
        product.extraImageUrl3 || '',
        product.maxPrice || 0,
        product.minPrice || 0,
        product.msrp || 0,
        product.name || '',
        product.nameAr || '',
        product.price || 0,
        product.primaryImageUrl || '',
        product.purchasePrice || 0,
        product.shippingCost || 0,
        product.shippingTime || '',
        product.size || '',
        product.sizeType || '',
        product.vatRateType || '',
        product.volumetricWeightCm || 0,
      ];

      // Handle backpressure: if buffer is full, wait for drain event
      if (!res.write(escapeCsv(row) + '\n')) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } catch (error) {
    console.error('Error in exportProductsToCSV:', error);
    throw error;
  } finally {
    if (cursor) {
      await cursor.close();
    }
  }
};

export const searchProuctsByFilter = async (filters = [], query, sellerId, channelId, search) => {
  let channel = null;

  if (channelId) {
    channel = await Channel.findOne({ channelId: Number(channelId) }, { channelId: 1, channelName: 1, _id: 0 }).lean();
  }

  const finalFilter = buildFilter({
    rawFilters: filters,
    sellerId,
    search,
    channelName: channel?.channelName,
    buildCondition,
  });

  const { page = 1, size = 10, sortBy = 'name', sortOrder = 'asc' } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  const [total, products] = await Promise.all([
    Product.countDocuments(finalFilter),

    Product.find(finalFilter)
      .collation({ locale: 'en', strength: 2 })
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select(
        '_id name status productSkuCode productType price msrp primaryImageUrl currentStockCount createdAt sellerId'
      )
      .lean(),
  ]);

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    channel,
  };
};

export default {
  fetchProducts,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  deleteProduct,
  getTopSellingProduct,
  updateProductStatus,
  deleteMultipleProducts,
  getUserChannelProducts,
  getUserUnassignedProducts,
  addProductsToUserChannel,
  getAllProductIdsBySellerId,
  unlinkProductFromChannel,
  validateProducts,
  pushProductsAsync,
  validateProductExportData,
  exportProductsToCSV,
  getProductById,
  searchProuctsByFilter,
  freezeOrUnfreezeProducts,
};
