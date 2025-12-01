import { config } from '#config/config.js';
import { ORDER_STATUS_MATCH, PRODUCT_STATUSES } from '#constants/common.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import {
  determineProductType,
  resolveProductTypes,
  validateHierarchy,
  validateHierarchyExistenceBatch,
} from '#helpers/ProductHierarchy.js';
import { mapProductToChannelEngine } from '#helpers/ProductMapper.js';
import {
  escapeCsv,
  generateCSVFilename,
  createCSVExportResponse,
  handleExportError,
  validateExportData,
  generateDynamicHeaders,
  generateDynamicRowData,
} from '#helpers/export.js';
import Channel from '#models/Channel.js';
import Seller from '#models/Seller.js';
import Order from '#models/Orders.js';
import Product from '#models/Product.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import { mapRowToProduct } from '#utils/mapRowToProduct.js';
import { uploadProducts } from '#service/channel/ocpService.js';
import csv from 'csv-parser';
import fs from 'fs';
import mongoose from 'mongoose';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import { insertCategoryTrail } from '../service/categoryService.js';
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
const EXPORT_CHUNK_SIZE = parseInt(process.env.EXPORT_CHUNK_SIZE || '1000', 10); // Chunk size for CSV export processing
const MAX_RETRIES = 3;

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

  const filter = { status: { $ne: 'removed' }, sellerId: new mongoose.Types.ObjectId(sellerId), productType: 'simple' };

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
      .map(t => t.trim().replace(/'/g, ''));

    filter.productType = { $in: productTypes };
    appliedFilters.productType = productTypes;
  } else {
    filter.productType = 'simple';
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
  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };
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
        'x-ocp-tenant-slug': seller.slug,
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

//  Async push products to CE
const pushProductsAsync = async (products, channelId, sellerId) => {
  const channel = await Channel.findOne({ channelId });

  if (!channel) {
    throw new Error(`Channel with ID ${channelId} not found`);
  }

  const limit = pLimit(MAX_CONCURRENT);
  const batches = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  await Promise.allSettled(
    batches.map((batch, idx) =>
      limit(async () => {
        try {
          //return await pushBatch(batch.map(mapProductToChannelEngine), idx);

          if (channel.channelName === 'OCP') {
            return await pushBatchToOCP(uploadProducts(batch), idx, sellerId);
          } else {
            return await pushBatch(batch.map(mapProductToChannelEngine), idx);
          }
        } catch (err) {
          console.error(`Batch ${idx} CE Push failed:`, err.message);
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

export const processImportStream = async (stream, { deleteAfter, filePath, locale, sellerId } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;
  let batch = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let invalidRowsCount = 0;
  const errorDetails = [];
  const categoryTrails = new Set();
  const allProductsForHierarchy = [];
  const rowPromises = [];

  await new Promise((resolve, reject) => {
    let rowIndex = 1;

    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;
        const currentRow = rowIndex;

        const rowPromise = (async () => {
          try {
            const isEmpty = Object.values(row).every((v) => v == null || String(v).trim() === '');
            if (isEmpty) {
              errorDetails.push({ rowNumber: currentRow, errorData: [locale.EMPTY_ROW] });
              invalidRowsCount++;
              return;
            }

            const product = await mapRowToProduct(row, currentRow, locale, sellerId);
            product.rowNumber = currentRow;

            if (product.errorData) {
              errorDetails.push(product);
              invalidRowsCount++;
              return;
            }

            // Determine product type
            try {
              product.productType = determineProductType(product);
            } catch (err) {
              errorDetails.push({ rowNumber: currentRow, errorData: [err.message] });
              invalidRowsCount++;
              return;
            }

            product['sellerId'] = sellerId;
            const isPriceRequired = product.productType === 'simple';
            if (isPriceRequired && (!product.price || isNaN(parseFloat(product.price)))) {
              errorDetails.push({
                rowNumber: currentRow,
                errorData: [locale.PRODUCT_PRICE_MISSING],
              });
              invalidRowsCount++;
              return;
            }
            // Structure validation
            const { valid, errors } = validateHierarchy(product);
            if (!valid) {
              errorDetails.push({ rowNumber: currentRow, errorData: errors });
              invalidRowsCount++;
              return;
            }

            allProductsForHierarchy.push(product);
          } catch (err) {
            console.error(`Row ${currentRow} error:`, err.message);
            invalidRowsCount++;
          }
        })();

        rowPromises.push(rowPromise);
      })
      .on('end', async () => {
        await Promise.all(rowPromises);
        resolve();
      })
      .on('error', reject);
  });

  // Validate parent & grandparent existence across all rows
  const { validated, errors: hierarchyErrors } = await validateHierarchyExistenceBatch(
    allProductsForHierarchy,
    sellerId
  );
  if (hierarchyErrors.length > 0) {
    errorDetails.push(...hierarchyErrors);
    invalidRowsCount += hierarchyErrors.length;
  }

  const validProducts = validated.filter((v) => v.valid).map((v) => v.product);

  for (const product of validProducts) {
    const existing = await Product.findOne({ sellerId, productSkuCode: product.productSkuCode }).lean();

    if (existing && existing.status === 'removed') {
      product.status = 'active';
    }

    const op = {
      updateOne: {
        filter: { sellerId, productSkuCode: product.productSkuCode },
        update: { $set: product },
        upsert: true,
      },
    };

    if (existing?._id) updatedCount++;
    else insertedCount++;

    batch.push(op);

    if (product.categoryTrail) categoryTrails.add(product.categoryTrail);

    if (batch.length >= batchSize) {
      const toProcess = [...batch];
      batch = [];
      await Product.bulkWrite(toProcess, { ordered: false });
    }
  }

  if (batch.length) await Product.bulkWrite(batch, { ordered: false });

  if (deleteAfter && filePath) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('File cleanup failed:', err.message);
    }
  }

  if (categoryTrails.size > 0) {
    await insertCategoryTrail([...categoryTrails], sellerId);
  }

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

export const importProductsFromGoogleSheet = async (url, locale, sellerId) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);
    const stream = Readable.fromWeb(res.body);
    return await processImportStream(stream, { locale, sellerId });
  } catch (err) {
    console.error('Error in importProductsFromGoogleSheet:', err);
    throw new Error(err.message); // force the catch block
  }
};

/* CSV File Import */

export const importProductsFromCsvFile = async (filePath, locale, sellerId) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath, locale, sellerId });
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

  const product = await Product.findOne({ _id: id, status: { $ne: 'removed' } }).lean();
  if (!product) return { success: false, message: locale?.PRODUCT_NOT_FOUND };

  // Fetch all related products
  const relatedProducts = await Product.find({
    status: { $ne: 'removed' },
    $or: [
      { productSkuCode: product.productSkuCode },
      { productSkuCode: product.parentProductSkuCode },
      { productSkuCode: product.grandParentProductSkuCode },
      { parentProductSkuCode: product.productSkuCode },
      { parentProductSkuCode: product.parentProductSkuCode },
      { parentProductSkuCode: product.grandParentProductSkuCode },
      { grandParentProductSkuCode: product.productSkuCode },
      { grandParentProductSkuCode: product.parentProductSkuCode },
      { grandParentProductSkuCode: product.grandParentProductSkuCode }
    ]

  }).lean();

  const map = {};
  relatedProducts.forEach(p => map[p.productSkuCode] = { ...p, children: [] });

  // Connect children to parent/grandparent
  Object.values(map).forEach(p => {
    const parent = p.parentProductSkuCode ? map[p.parentProductSkuCode] : null;
    const grandParent = p.grandParentProductSkuCode ? map[p.grandParentProductSkuCode] : null;
    if (parent) parent.children.push(map[p.productSkuCode]);
    else if (grandParent) grandParent.children.push(map[p.productSkuCode]);
  });

  // Find grandparent root starting from the current product
  let current = map[product.productSkuCode];
  if (!current) return { success: false, message: locale?.PRODUCT_NOT_FOUND };

  while (current.parentProductSkuCode || current.grandParentProductSkuCode) {
    if (current.parentProductSkuCode && map[current.parentProductSkuCode]) {
      current = map[current.parentProductSkuCode];
    } else if (current.grandParentProductSkuCode && map[current.grandParentProductSkuCode]) {
      current = map[current.grandParentProductSkuCode];
    } else {
      break;
    }
  }

  // If grandParentProductSkuCode is missing, fetch from parent
  if (!product.grandParentProductSkuCode && product.parentProductSkuCode) {
    const parent = await Product.findOne({ productSkuCode: product.parentProductSkuCode, status: { $ne: 'removed' } }).lean();
    if (parent?.grandParentProductSkuCode) {
      product.grandParentProductSkuCode = parent.grandParentProductSkuCode;
    }
  }

  const formatNode = node => ({
    id: node._id,
    name: node.name,
    sku: node.productSkuCode,
    price: node.price,
    type: node.parentProductSkuCode ? 'child' : node.grandParentProductSkuCode ? 'parent' : 'grandparent',
    barcode: node.ean,
    children: node.children.map(formatNode)
  });

  return {
    success: true,
    message: locale?.PRODUCT_FETCH_SUCCESS,
    data: {
      ...product,
      variations: [formatNode(current)]
    }
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
        status: { $ne: 'removed' },
        productType: 'simple',
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
  const { page = 1, size = 10, search, sortBy = '_id', sortOrder = 'asc', status, minPrice, maxPrice, productType } = query;
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
      .map(t => t.trim().replace(/'/g, ''));
    matchProductStage['productDetails.productType'] = { $in: productTypes };
    appliedFilters.productType = productTypes;
  } else {
    matchProductStage['productDetails.productType'] = 'simple';
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
  const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : '_id';

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

  const result = await UserChannelProducts.aggregate(pipeline, { allowDiskUse: true });
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
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = '_id', sortOrder = 'asc', productType } = query;
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
  const filter = { status: { $ne: 'removed' }, sellerId: new mongoose.Types.ObjectId(sellerId) };

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
      .map(t => t.trim().replace(/'/g, ''));

    filter.productType = { $in: productTypes };
    appliedFilters.productType = productTypes;
  } else {
    filter.productType = 'simple';
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

export const exportProductsToCSV = async (sellerId = null, filters = {}) => {
  try {
    const {
      status,
      search,
      minPrice,
      maxPrice,
      productSkuCode,
      size = 100000,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    // Build filters only with non-empty values
    const filter = {
      status: { $ne: 'removed' },
      sellerId: new mongoose.Types.ObjectId(sellerId),
    };

    // Apply filters directly if they exist
    if (status) {
      const statusValue = status.toString().trim().toLowerCase();
      if (PRODUCT_STATUSES.includes(statusValue)) {
        filter.status = statusValue;
      }
    }

    if (productSkuCode) {
      filter.productSkuCode = { $regex: new RegExp(productSkuCode, 'i') };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ name: regex }, { productSkuCode: regex }];
    }

    // Sorting
    const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

    const [products, totalCount] = await Promise.all([
      Product.find(filter).sort(sort).limit(parseInt(size, 10)).lean(),
      Product.countDocuments(filter),
    ]);

    const validation = validateExportData(products, 'products');
    if (!validation.success) {
      return validation;
    }

    const headers = generateDynamicHeaders(Product);

    // Process products in parallel chunks for better performance
    const chunks = [];
    for (let i = 0; i < products.length; i += EXPORT_CHUNK_SIZE) {
      chunks.push(products.slice(i, i + EXPORT_CHUNK_SIZE));
    }

    // Process each chunk in parallel using dynamic row generation
    const processChunk = async (chunk) => {
      return chunk.map((product) => {
        const row = generateDynamicRowData(product, Product);
        return escapeCsv(row);
      });
    };

    const processedChunks = await Promise.all(chunks.map(processChunk));

    // Flatten the results and create CSV
    const csvRows = [headers.join(','), ...processedChunks.flat()];
    const filename = generateCSVFilename('products');

    return {
      ...createCSVExportResponse(csvRows, filename, products.length),
      totalCount,
    };
  } catch (error) {
    return handleExportError(error, 'products');
  }
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
  exportProductsToCSV,
  getProductById,
};
