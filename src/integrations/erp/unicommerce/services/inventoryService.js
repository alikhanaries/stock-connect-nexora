import Product from '#models/Product.js';
import Inventory from '#models/Inventory.js';
import { ObjectId } from 'mongodb';
import { getProductStatus, getSellerNameById } from '#root/src/util/mapRowToInventory.js';

export const updateInventory = async (sellerId, inventoryList = [], locale) => {
  try {
    const failedProductList = [];
    const now = new Date();
    const sellerName = await getSellerNameById(sellerId);

    for (const item of inventoryList) {
      const { productId, variantId, inventory } = item;

      try {
        const stock = Number(inventory);

        const product = await Product.findOne({ _id: new ObjectId(productId) }, { _id: 1, productSkuCode: 1 }).lean();

        if (!product) {
          throw new Error(locale?.NOT_FOUND || 'Product not found');
        }

        await Inventory.findOneAndUpdate(
          { sellerId, productId },
          {
            $set: {
              currentStockCount: stock,
              lastSyncedAt: now,
            },
            $setOnInsert: {
              sellerId,
              productId,
              productSkuCode: product.productSkuCode,
              createdAt: now,
            },
          },
          {
            new: true,
            upsert: true,
            lean: true,
          }
        );
        const prodStatus = getProductStatus(sellerName, stock);

        await Product.updateOne(
          { _id: productId },
          {
            $set: {
              currentStockCount: stock,
              status: prodStatus,
              updatedAt: now,
            },
          }
        );
      } catch (err) {
        failedProductList.push({
          productId,
          variantId,
          message: err.message || 'Inventory update failed',
        });
      }
    }

    let status = 'SUCCESS';

    if (failedProductList.length === inventoryList.length) {
      status = 'FAILED';
    } else if (failedProductList.length > 0) {
      status = 'PARTIAL_SUCCESS';
    }

    return {
      status,
      failedProductList,
    };
  } catch (err) {
    console.error('Service unicommerce updateInventory error:', err);
    throw err;
  }
};

export default {
  updateInventory,
};
