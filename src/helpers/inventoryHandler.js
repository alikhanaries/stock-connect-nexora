import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import { getProductStatus } from '#utils/mapRowToInventory.js';
import { runInTransaction } from '#util/mongoTransaction.js';

const withSession = (session, options = {}) => (session ? { ...options, session } : options);

const applyIncreaseStock = async (sku, qty, sellerId, sellerName, type, session) => {
  const inventory = await Inventory.findOneAndUpdate(
    { productSkuCode: sku, sellerId },
    { $inc: { currentStockCount: qty } },
    withSession(session, { new: true })
  );
  const product = await Product.findOneAndUpdate(
    { productSkuCode: sku, sellerId },
    { $inc: { currentStockCount: qty }, $set: { updatedAt: new Date() } },
    withSession(session, { new: true })
  );

  if (!inventory || !product) {
    throw new Error('Inventory or product not found');
  }

  const prodStatus = getProductStatus(sellerName, product.currentStockCount);
  if (prodStatus !== product.status) {
    await Product.updateOne({ productSkuCode: sku, sellerId }, { $set: { status: prodStatus } }, withSession(session));
  }

  const stockPayload = {
    MerchantProductNo: sku,
    StockLocations: [
      {
        Stock: inventory.currentStockCount,
      },
    ],
  };

  return {
    success: true,
    message: 'Stock increased successfully',
    stockPayload: type === 'CE' ? stockPayload : null,
  };
};

const applyDecreaseStock = async (sku, qty, sellerId, sellerName, type, session) => {
  const inventory = await Inventory.findOneAndUpdate(
    { productSkuCode: sku, currentStockCount: { $gte: qty } },
    { $inc: { currentStockCount: -qty } },
    withSession(session, { new: true })
  );
  const product = await Product.findOneAndUpdate(
    { productSkuCode: sku, currentStockCount: { $gte: qty } },
    { $inc: { currentStockCount: -qty }, $set: { updatedAt: new Date() } },
    withSession(session, { new: true })
  );

  if (!inventory || !product) {
    throw new Error('Inventory or product not found or insufficient stock');
  }

  const prodStatus = getProductStatus(sellerName, product.currentStockCount);
  if (prodStatus !== product.status) {
    await Product.updateOne({ productSkuCode: sku, sellerId }, { $set: { status: prodStatus } }, withSession(session));
  }

  const stockPayload = {
    MerchantProductNo: sku,
    StockLocations: [
      {
        Stock: inventory.currentStockCount,
      },
    ],
  };

  return {
    success: true,
    message: 'Stock decreased successfully',
    stockPayload: type === 'CE' ? stockPayload : null,
  };
};

export const increaseStock = async (sku, quantity, sellerId, sellerName, type, session = null) => {
  try {
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

    const run = (activeSession) => applyIncreaseStock(sku, qty, sellerId, sellerName, type, activeSession);

    if (session) {
      return await run(session);
    }

    return await runInTransaction(run);
  } catch (error) {
    if (error.message === 'Inventory or product not found') {
      return { success: false, message: error.message };
    }
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      throw error;
    }
    console.error('Service increaseStock error:', error);
    return { success: false, message: 'server error' };
  }
};

export const decreaseStock = async (sku, quantity, sellerId, sellerName, type, session = null) => {
  try {
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

    const run = (activeSession) => applyDecreaseStock(sku, qty, sellerId, sellerName, type, activeSession);

    if (session) {
      return await run(session);
    }

    return await runInTransaction(run);
  } catch (error) {
    if (error.message === 'Inventory or product not found or insufficient stock') {
      return { success: false, message: error.message };
    }
    if (error.code === 20 || error.codeName === 'IllegalOperation') {
      throw error;
    }
    console.error('Service decreaseStock error:', error);
    return { success: false, message: 'server error' };
  }
};

export const validateStockAvailability = async (products, sellerId) => {
  for (const product of products) {
    const qty = Number(product.quantity || 0);
    const inventory = await Inventory.findOne({
      productSkuCode: product.merchantProductNo,
      sellerId,
      currentStockCount: { $gte: qty },
    }).lean();

    if (!inventory) {
      return {
        success: false,
        message: `Insufficient stock for ${product.merchantProductNo}. Required: ${qty}`,
      };
    }
  }
  return { success: true };
};
