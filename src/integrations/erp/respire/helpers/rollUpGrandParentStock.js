import mongoose from 'mongoose';
import Product from '#models/Product.js';

// Respire bakes the color into productCode, so one grandparent (e.g. "21073") is shared
// by several Respire products ("21073A.Mavi", "21073K.Mavi", ...). Its stock can't come
// from any single product, so recompute it as the sum of all its color parents in the DB.
export const rollUpGrandParentStock = async (sellerId, grandParentSkus = []) => {
  const skus = [...new Set(grandParentSkus.filter(Boolean))];
  if (!skus.length) return;

  const sellerObjectId = new mongoose.Types.ObjectId(String(sellerId));
  const totals = await Product.aggregate([
    {
      $match: {
        sellerId: sellerObjectId,
        grandParentProductSkuCode: { $in: skus },
        parentProductSkuCode: null,
      },
    },
    { $group: { _id: '$grandParentProductSkuCode', stock: { $sum: '$currentStockCount' } } },
  ]);

  if (!totals.length) return;

  const now = new Date();
  await Product.bulkWrite(
    totals.map(({ _id, stock }) => ({
      updateOne: {
        filter: { sellerId: sellerObjectId, productSkuCode: _id },
        update: { $set: { currentStockCount: stock, status: stock > 0 ? 'active' : 'inactive', updatedAt: now } },
      },
    })),
    { ordered: false }
  );
};
