import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import { sendStockBatch } from '../service/InventoryService.js';
import { getProductStatus } from '#utils/mapRowToInventory.js';

export const increaseStock = async (sku, quantity, sellerName, type) => {
  try {
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

    const [inventory, product] = await Promise.all([
      Inventory.findOneAndUpdate({ productSkuCode: sku }, { $inc: { currentStockCount: qty } }, { new: true }),
      Product.findOneAndUpdate(
        { productSkuCode: sku },
        { $inc: { currentStockCount: qty }, $set: { updatedAt: new Date() } },
        { new: true }
      ),
    ]);

    if (!inventory || !product) {
      return { success: false, message: 'Inventory or product not found' };
    }

    const prodStatus = getProductStatus(sellerName, product.currentStockCount);

    if (prodStatus !== product.status) {
      await Product.updateOne({ productSkuCode: sku }, { $set: { status: prodStatus } });
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
    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: 'Invalid quantity provided' };
    }
    if (qty === 0) {
      return { success: true, message: 'Quantity is zero, no changes needed' };
    }

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

    if (inventory.currentStockCount < qty || product.currentStockCount < qty) {
      return { success: false, message: 'Inventory stock is less than quantity' };
    }

    inventory.currentStockCount -= qty;
    product.currentStockCount -= qty;
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
