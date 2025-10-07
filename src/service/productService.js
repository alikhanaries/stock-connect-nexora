import { config } from '#config/config.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import Order from '#models/Orders.js';
import { mapProductToChannelEngine } from '#helpers/ProductMapper.js';
import '#models/Category.js';
import Product from '#models/Product.js';
import { mapRowToProduct } from '#utils/mapRowToProduct.js';
import csv from 'csv-parser';
import fs from 'fs';
import pLimit from 'p-limit';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import { ORDER_STATUS_MATCH, PRODUCT_STATUSES } from '#constants/common.js';
import { getMarketPlaceCategoryTrailsService, insertCategoryTrail } from '../service/categoryService.js';
import Channel from '#models/Channel.js';
const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY, CHANNEL_ENGINE_BATCH_SIZE, CHANNEL_ENGINE_MAX_CONCURRENT } =
  config;

const BATCH_SIZE = parseInt(CHANNEL_ENGINE_BATCH_SIZE || '500', 10);
const MAX_CONCURRENT = parseInt(CHANNEL_ENGINE_MAX_CONCURRENT || '5', 10);
const MAX_RETRIES = 3;

const fetchProducts = async (query) => {
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
  } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  const filter = { status: { $ne: 'removed' } };
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
        imageUrl: { $arrayElemAt: ['$productDetails.images', 0] },
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

// 🔹 Validate products
const validateProducts = async (channelId) => {
  const channelProducts = await UserChannelProducts.find({ channelId }, { 'skuList.skuCode': 1, _id: 0 }).lean();
  const skuCodes = channelProducts.flatMap((cp) => cp.skuList.map((s) => s.skuCode));
  if (!skuCodes.length) return { total: 0, validProducts: [], failed: 0, validatedProducts: [] };
  const products = await Product.find({ productSkuCode: { $in: skuCodes }, status: 'active' }).lean();
  const trailCache = new Map();
  const validatedProducts = await Promise.all(
    products.map(async (product) => {
      if (!trailCache.has(product.categoryTrail)) {
        trailCache.set(product.categoryTrail, await getMarketPlaceCategoryTrailsService(product.categoryTrail));
      }
      const trails = trailCache.get(product.categoryTrail);
      const errors = [];
      if (!trails?.marketPlaceTrailData?.length) {
        errors.push(trails?.platformCategoryName || 'Missing category trail');
      }
      return {
        ...product,
        categoryTrailAmazon:
          trails?.marketPlaceTrailData?.find((t) => t.marketplacename === 'Amazon.in (v3)')
            ?.marketplaceCategoryTrails || null,
        categoryTrailNoon:
          trails?.marketPlaceTrailData?.find((t) => t.marketplacename === 'Noon V2')?.marketplaceCategoryTrails || null,
        Errors: errors,
        Warnings: [],
      };
    })
  );
  const bulkOps = validatedProducts
    .filter((p) => p.categoryTrailAmazon || p.categoryTrailNoon)
    .map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            categoryTrailAmazon: p.categoryTrailAmazon,
            categoryTrailNoon: p.categoryTrailNoon,
          },
        },
      },
    }));

  if (bulkOps.length) {
    await Product.bulkWrite(bulkOps, { ordered: false });
  }
  const validProducts = validatedProducts.filter((p) => p.Errors.length === 0);
  const failed = validatedProducts.length - validProducts.length;
  return { total: validatedProducts.length, validProducts, failed, validatedProducts };
};

//  Async push products to CE
const pushProductsAsync = async (products) => {
  const limit = pLimit(MAX_CONCURRENT);
  const batches = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  await Promise.allSettled(
    batches.map((batch, idx) =>
      limit(async () => {
        try {
          return await pushBatch(batch.map(mapProductToChannelEngine), idx);
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

export const processImportStream = async (stream, { deleteAfter, filePath } = {}) => {
  const batchSize = Number(process.env.BATCH_SIZE) || 500;
  let batch = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let invalidRowsCount = 0;
  const categoryTrails = new Set();
  const rowPromises = [];

  await new Promise((resolve, reject) => {
    let rowIndex = 0;

    stream
      .pipe(csv())
      .on('data', (row) => {
        rowIndex++;

        const rowPromise = (async () => {
          try {
            // skip empty rows
            const isEmpty = Object.values(row).every((val) => val == null || String(val).trim() === '');
            if (isEmpty) {
              invalidRowsCount++;
              return;
            }

            // map row
            const product = await mapRowToProduct(row);
            if (!product) {
              invalidRowsCount++;
              return;
            }

            if (product?.categoryTrail) {
              categoryTrails.add(product.categoryTrail);
            }

            batch.push(product);

            // flush batch if full
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

              const res = await Product.bulkWrite(ops, { ordered: false });
              insertedCount += res.upsertedCount || 0;
              updatedCount += res.modifiedCount || 0;
              console.log(`Batch upsert: inserted ${res.upsertedCount}, updated ${res.modifiedCount}`);
            }
          } catch (err) {
            console.error(`Row ${rowIndex} error:`, err.message);
            invalidRowsCount++;
          }
        })();

        rowPromises.push(rowPromise);
      })
      .on('end', async () => {
        try {
          // wait for all rows to finish
          await Promise.all(rowPromises);

          // final flush
          if (batch.length) {
            const ops = batch.map((p) => ({
              updateOne: {
                filter: { productSkuCode: p.productSkuCode },
                update: [
                  {
                    $set: {
                      ...p,
                      status: {
                        $cond: [{ $eq: ['$status', 'removed'] }, 'active', { $ifNull: ['$status', 'active'] }],
                      },
                    },
                  },
                ],
                upsert: true,
              },
            }));

            const res = await Product.bulkWrite(ops, { ordered: false });
            insertedCount += res.upsertedCount || 0;
            updatedCount += res.modifiedCount || 0;
          }

          // cleanup uploaded file
          if (deleteAfter && filePath) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.warn('File cleanup failed:', err.message);
            }
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', reject);
  });

  // insert category trails
  if (categoryTrails.size > 0) {
    await insertCategoryTrail([...categoryTrails]);
  }
  return {
    success: true,
    message: `Imported ${insertedCount} new products, updated ${updatedCount}, skipped ${invalidRowsCount} invalid rows`,
    insertedCount,
    updatedCount,
    invalidRowsCount,
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
    throw new Error(err.message); // force the catch block
  }
};

/* CSV File Import */
export const importProductsFromCsvFile = async (filePath) => {
  try {
    const stream = fs.createReadStream(filePath);
    return await processImportStream(stream, { deleteAfter: true, filePath });
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

    return {
      success: true,
      message: `${result.modifiedCount} ${locale?.PRODUCT_MARKED_DELETED}`,
    };
  } catch (err) {
    console.error('Service error in deleteMultipleProducts:', err);
    throw new Error(err.message); // force the catch block
  }
};
/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
const addProductsToUserChannel = async (userId, channelId, productIds, locale) => {
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
      { userId, channelId },
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
          filter: { _id: p._id },
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

export const getUserChannelProducts = async (userId, channelId, query) => {
  const { page = 1, size = 10, search, sortBy = '_id', sortOrder = 'asc', status, minPrice, maxPrice } = query;
  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const appliedFilters = {};

  const matchStage = {
    userId: new mongoose.Types.ObjectId(userId),
    channelId: Number(channelId),
  };

  // ✅ Step 1: Fetch channel details separately (before product pipeline)
  const channelDetails = await Channel.findOne(
    { channelId: Number(channelId) },
    { channelId: 1, channelName: 1, _id: 0 }
  ).lean();

  // ✅ Step 2: Build product pipeline
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

  pipeline.push({
    $sort: { [`productDetails.${safeSortBy}`]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 },
  });

  pipeline.push({
    $facet: {
      paginatedResults: [
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
            images: '$productDetails.images',
            currentStockCount: '$productDetails.currentStockCount',
            createdAt: '$productDetails.createdAt',
          },
        },
      ],
      totalCount: [{ $count: 'count' }],
    },
  });

  // ✅ Step 3: Run aggregation
  const result = await UserChannelProducts.aggregate(pipeline);
  const total = result[0]?.totalCount[0]?.count || 0;
  const products = result[0]?.paginatedResults || [];

  // ✅ Final Response with channel outside products
  return {
    channel: channelDetails,
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

const getUserUnassignedProducts = async (userId, channelId, query) => {
  const { page = 1, size = 10, status, minPrice, maxPrice, search, sortBy = '_id', sortOrder = 'asc' } = query;
  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));
  const assignedSku = await UserChannelProducts.findOne(
    { userId: new mongoose.Types.ObjectId(userId), channelId: Number(channelId), isActive: true },
    { 'skuList.skuCode': 1 }
  ).lean();

  const assignedSkuCodes = assignedSku?.skuList?.map((s) => s.skuCode) || [];

  const filter = { status: { $ne: 'removed' } };
  const appliedFilters = {};

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

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) {
      filter.price.$gte = Number(minPrice);
      appliedFilters.minPrice = filter.price.$gte;
    }
    if (maxPrice) {
      filter.price.$lte = Number(maxPrice);
      appliedFilters.maxPrice = filter.price.$lte;
    }
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ name: regex }, { productSkuCode: regex }];
  }

  const sort = { [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1 };

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort(sort)
    .skip((currentPage - 1) * limit)
    .limit(limit)
    .select('_id name status productSkuCode price msrp images')
    .lean();

  return {
    products,
    pagination: getPagination(total, currentPage, limit),
    appliedFilters,
  };
};

const removeProductsFromChannelEngine = async (skuCodes) => {
  if (!skuCodes?.length) return;

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
};

const unlinkProductFromChannel = async (userId, channelId, ids, locale) => {
  try {
    const products = await Product.find({ _id: { $in: ids } }, { productSkuCode: 1, marketPlace: 1 }).lean();
    if (!products.length) return 0;
    const skuCodes = products.map((p) => p.productSkuCode);
    const ceResult = skuCodes.length > 0 ? await removeProductsFromChannelEngine(skuCodes) : { success: true };
    if (!ceResult.success) {
      return { success: false, message: 'ChannelEngine deletion failed', ceError: ceResult.message };
    }
    const result = await UserChannelProducts.updateMany(
      { userId: new mongoose.Types.ObjectId(userId), channelId: Number(channelId) },
      { $pull: { skuList: { skuCode: { $in: skuCodes } } } }
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
            filter: { _id: p._id },
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
  unlinkProductFromChannel,
  validateProducts,
  pushProductsAsync,
};
