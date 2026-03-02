import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import { sendStockBatch } from '../service/InventoryService.js';
import { getProductStatus } from '#utils/mapRowToInventory.js';

export const increaseStock = async (sku, quantity, sellerName, type) => {
  try {
    const [inventory, product] = await Promise.all([
      Inventory.findOne({ productSkuCode: sku }).select('currentStockCount'),
      Product.findOne({ productSkuCode: sku }).select('currentStockCount updatedAt status'),
    ]);

    if (!inventory || !product) {
      return { success: false, message: 'Inventory or product not found' };
    }

    inventory.currentStockCount += quantity;
    product.currentStockCount += quantity;
    product.updatedAt = new Date();

    const prodStatus = getProductStatus(sellerName, product.currentStockCount);

    if (prodStatus !== product.status) {
      product.status = prodStatus;
    }

    try {
      await Promise.all([inventory.save(), product.save()]);
    } catch (err) {
      console.error('Service increaseStock error:', err);
      return { success: false, message: 'Failed to update stock in db' };
    }

    const payload = {
      MerchantProductNo: sku,
      StockLocations: [
        {
          Stock: inventory.currentStockCount,
        },
      ],
    };

    if (type === 'CE') {
      await sendStockBatch([payload]);
    }

    return { success: true, message: 'Stock increased successfully' };
  } catch (error) {
    console.error('Service increaseStock error:', error);
    throw error;
  }
};

export const decreaseStock = async (sku, quantity, sellerName, type) => {
  try {
    const [inventory, product] = await Promise.all([
      Inventory.findOne({ productSkuCode: sku }).select('currentStockCount'),
      Product.findOne({ productSkuCode: sku }).select('currentStockCount updatedAt status'),
    ]);

    if (!inventory || !product) {
      return { success: false, message: 'Inventory or product not found' };
    }

    if (inventory.currentStockCount === 0 || product.currentStockCount === 0) {
      return { success: false, message: 'Inventory stock is zero' };
    }

    if (inventory.currentStockCount < quantity || product.currentStockCount < quantity) {
      return { success: false, message: 'Inventory stock is less than quantity' };
    }

    inventory.currentStockCount -= quantity;
    product.currentStockCount -= quantity;
    product.updatedAt = new Date();

    const prodStatus = getProductStatus(sellerName, product.currentStockCount);

    if (prodStatus !== product.status) {
      product.status = prodStatus;
    }

    await Promise.all([inventory.save(), product.save()]);

    const payload = {
      MerchantProductNo: sku,
      StockLocations: [
        {
          Stock: inventory.currentStockCount,
        },
      ],
    };

    if (type === 'CE') {
      await sendStockBatch([payload]);
    }

    return { success: true, message: 'Stock decreased successfully' };
  } catch (error) {
    console.error('Service decreaseStock error:', error);
    return { success: false, message: 'server error' };
  }
};
