import Product from '#root/src/models/Product.js';
import { ObjectId } from 'mongodb';

export const buildProductIdBySku = async (sellerId, orders) => {
  const skus = [
    ...new Set(orders.flatMap((o) => (o.orderSkuList?.skuList || []).map((i) => i.merchantProductNo).filter(Boolean))),
  ];
  const map = new Map();
  if (!skus.length) return map;

  const sellerObjectId = ObjectId.isValid(sellerId) ? new ObjectId(sellerId) : sellerId;
  const skuProducts = await Product.find({
    sellerId: sellerObjectId,
    productSkuCode: { $in: skus },
  })
    .select('productSkuCode parentProductSkuCode grandParentProductSkuCode')
    .lean();

  if (!skuProducts.length) return map;

  const parentSkus = [
    ...new Set(skuProducts.map((p) => p.parentProductSkuCode || p.grandParentProductSkuCode || p.productSkuCode)),
  ];
  const parents = await Product.find({
    sellerId: sellerObjectId,
    productSkuCode: { $in: parentSkus },
  })
    .select('productSkuCode')
    .lean();

  const parentIdBySku = new Map(parents.map((p) => [p.productSkuCode, p._id]));
  for (const p of skuProducts) {
    const parentSku = p.parentProductSkuCode || p.grandParentProductSkuCode || p.productSkuCode;
    const parentId = parentIdBySku.get(parentSku);
    if (parentId) map.set(p.productSkuCode, parentId);
  }

  return map;
};

export default buildProductIdBySku;
