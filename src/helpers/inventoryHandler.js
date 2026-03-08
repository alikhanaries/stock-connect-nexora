import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import { sendStockBatch } from '../service/InventoryService.js';
import { getProductStatus } from '#utils/mapRowToInventory.js';

export const increaseStock = async (sku, quantity, sellerName, type, session = null) => {
  try {
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

    const opts = session ? { new: true, session } : { new: true };

    const inventory = await Inventory.findOneAndUpdate(
      { productSkuCode: sku },
      { $inc: { currentStockCount: qty } },
      opts
    );
    const product = await Product.findOneAndUpdate(
      { productSkuCode: sku },
      { $inc: { currentStockCount: qty }, $set: { updatedAt: new Date() } },
      opts
    );

    if (!inventory || !product) {
      return { success: false, message: 'Inventory or product not found' };
    }

    const prodStatus = getProductStatus(sellerName, product.currentStockCount);

    if (prodStatus !== product.status) {
      await Product.updateOne({ productSkuCode: sku }, { $set: { status: prodStatus } }, session ? { session } : {});
    }

    const payload = {
      MerchantProductNo: sku,
      StockLocations: [
        {
          Stock: inventory.currentStockCount,
        },
      ],
    };

    if (type === 'CE' && !session) {
      await sendStockBatch([payload]);
    }

    return {
      success: true,
      message: 'Stock increased successfully',
      stockPayload: type === 'CE' ? payload : null,
    };
  } catch (error) {
    console.error('Service increaseStock error:', error);
    return { success: false, message: 'server error' };
  }
};

export const decreaseStock = async (sku, quantity, sellerName, type, session = null) => {
  try {
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

    const opts = session ? { new: true, session } : { new: true };

    const inventory = await Inventory.findOneAndUpdate(
      { productSkuCode: sku, currentStockCount: { $gte: qty } },
      { $inc: { currentStockCount: -qty } },
      opts
    );
    const product = await Product.findOneAndUpdate(
      { productSkuCode: sku, currentStockCount: { $gte: qty } },
      { $inc: { currentStockCount: -qty }, $set: { updatedAt: new Date() } },
      opts
    );

    if (!inventory || !product) {
      return { success: false, message: 'Inventory or product not found or insufficient stock' };
    }

    const prodStatus = getProductStatus(sellerName, product.currentStockCount);
    if (prodStatus !== product.status) {
      await Product.updateOne({ productSkuCode: sku }, { $set: { status: prodStatus } }, session ? { session } : {});
    }

    const stockPayload = {
      MerchantProductNo: sku,
      StockLocations: [
        {
          Stock: inventory.currentStockCount,
        },
      ],
    };

    if (type === 'CE' && !session) {
      await sendStockBatch([stockPayload]);
    }

    return {
      success: true,
      message: 'Stock decreased successfully',
      stockPayload: type === 'CE' ? stockPayload : null,
    };
  } catch (error) {
    console.error('Service decreaseStock error:', error);
    return { success: false, message: 'server error' };
  }
};

export const validateStockAvailability = async (products) => {
  for (const product of products) {
    const qty = Number(product.quantity || 0);
    const inventory = await Inventory.findOne({
      productSkuCode: product.merchantProductNo,
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
