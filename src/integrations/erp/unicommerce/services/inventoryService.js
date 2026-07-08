import Product from '#models/Product.js';
import Inventory from '#models/Inventory.js';
import { getProductStatus, getSellerNameById } from '#root/src/util/mapRowToInventory.js';
const CHUNK_SIZE = 500;
const CONCURRENCY_LIMIT = 10;

export const updateInventory = async (sellerId, inventoryList = [], locale) => {
  try {
    if (!Array.isArray(inventoryList)) {
      throw new Error(locale?.INVALID_PAYLOAD || 'Invalid inventory list');
    }

    const failedProductList = [];
    const now = new Date();
    const sellerName = await getSellerNameById(sellerId);

    let index = 0;

    while (index < inventoryList.length) {
      const chunk = inventoryList.slice(index, index + CHUNK_SIZE);

      let innerIndex = 0;

      while (innerIndex < chunk.length) {
        const batch = chunk.slice(innerIndex, innerIndex + CONCURRENCY_LIMIT);

        await Promise.all(
          batch.map(async (item) => {
            const { productId, variantId, inventory } = item;

            try {
              // inventory validation
              const stock = Number(inventory);
              if (Number.isNaN(stock) || stock < 0) {
                throw new Error('Invalid inventory value');
              }

              if (!variantId || typeof variantId !== 'string') {
                throw new Error('Invalid variantId');
              }

              const product = await Product.findOne(
                { sellerId, productSkuCode: variantId },
                { _id: 1, productSkuCode: 1 }
              ).lean();

              if (!product) {
                throw new Error(locale?.NOT_FOUND || 'Product not found');
              }

              // inventory upsert
              await Inventory.findOneAndUpdate(
                { sellerId, productId: product._id },
                {
                  $set: {
                    currentStockCount: stock,
                    lastSyncedAt: now,
                  },
                  $setOnInsert: {
                    sellerId,
                    productId: product._id,
                    productSkuCode: product.productSkuCode,
                    createdAt: now,
                  },
                },
                { upsert: true }
              );

              // product status update
              const prodStatus = getProductStatus(sellerName, stock);

              await Product.updateOne(
                { _id: product._id },
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
          })
        );

        innerIndex += CONCURRENCY_LIMIT;
      }

      index += CHUNK_SIZE;
    }

    // Uniware status calculation
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
