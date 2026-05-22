import mongoose from 'mongoose';
import { getPagination } from '#helpers/PaginationHandler.js';
import ExpressWarehouseInventory from '#models/ExpressWarehouseInventory.js';
import Channel from '#models/Channel.js';
import Product from '#models/Product.js';
import { buildFilter } from '#utils/buildFilter.js';
import { buildCondition } from '../helpers/productFilters.js';

export const fetchExpressWareHouseProducts = async (filters = [], query, sellerId, channelId) => {
  const { page = 1, size = 10, sortBy = 'name', sortOrder = 'asc', search } = query;

  const currentPage = Math.max(1, Number(page));
  const limit = Math.max(1, Number(size));

  //  Validate sellerId
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }

  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  // -----------------------------
  // CHANNEL
  // -----------------------------
  let channel = null;
  const parsedChannelId = Number(channelId);

  if (channelId && !isNaN(parsedChannelId)) {
    channel = await Channel.findOne({ channelId: parsedChannelId }, { channelId: 1, channelName: 1, _id: 0 }).lean();
  }

  // -----------------------------
  // FETCH SKUs + quantity per SKU
  // -----------------------------
  const inventoryData = await ExpressWarehouseInventory.aggregate([
    {
      $match: {
        sellerId: sellerObjectId,
      },
    },
    {
      $group: {
        _id: '$sku',
        quantity: { $sum: '$quantity' },
        latestSync: { $max: '$lastSyncedAt' },
      },
    },
  ]);

  const skuQuantityMap = {};
  let latestInventorySync = null;
  for (const item of inventoryData) {
    skuQuantityMap[item._id] = item.quantity;
    if (!latestInventorySync || item.latestSync > latestInventorySync) {
      latestInventorySync = item.latestSync;
    }
  }

  const expressWarehouseSkus = Object.keys(skuQuantityMap);

  if (!expressWarehouseSkus.length) {
    return {
      products: [],
      pagination: getPagination(0, currentPage, limit),
      latestProductSyncDate: null,
      latestInventorySync: null,
      latestPriceSync: null,
      channel,
    };
  }

  // -----------------------------
  // BASE FILTER
  // -----------------------------
  const baseFilter = {
    status: { $ne: 'removed' },
    productSkuCode: { $in: expressWarehouseSkus },
  };

  // -----------------------------
  // DYNAMIC FILTER
  // -----------------------------
  const dynamicFilter = buildFilter({
    rawFilters: filters,
    sellerId,
    search,
    channelName: channel?.channelName,
    buildCondition,
  });

  const finalFilter =
    dynamicFilter && Object.keys(dynamicFilter).length ? { $and: [baseFilter, dynamicFilter] } : baseFilter;

  // -----------------------------
  // SORT
  // -----------------------------
  const sort = {
    [sortBy]: sortOrder.toLowerCase() === 'asc' ? 1 : -1,
    _id: 1,
  };

  // -----------------------------
  // FETCH
  // -----------------------------
  const [total, products] = await Promise.all([
    Product.countDocuments(finalFilter),

    Product.find(finalFilter)
      .sort(sort)
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .select(
        '_id name status productSkuCode price msrp primaryImageUrl isFrozen currentStockCount createdAt sellerId productType'
      )
      .lean(),
  ]);
  const productsWithStock = products.map((p) => ({
    ...p,
    currentStockCount: skuQuantityMap[p.productSkuCode] ?? 0,
  }));

  return {
    products: productsWithStock,
    pagination: getPagination(total, currentPage, limit),
    latestProductSyncDate: latestInventorySync,
    latestInventorySync: latestInventorySync,
    latestPriceSync: null,
    channel,
  };
};

export default {
  fetchExpressWareHouseProducts,
};
