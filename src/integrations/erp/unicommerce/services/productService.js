import Product from '#root/src/models/Product.js';
import { ObjectId } from 'mongodb';
import { formatProduct, mapChildrenByParent } from '../helpers/buildProductHierarchy.js';

export const fetchProductsCount = async (sellerId, publishedStatus) => {
  try {
    const sellerObjectId = new ObjectId(sellerId);

    const baseFilter = {
      sellerId: sellerObjectId,
    };
    if (publishedStatus?.toUpperCase() === 'PUBLISHED') {
      baseFilter.status = 'active';
    }

    const childrenCount = await Product.countDocuments({
      ...baseFilter,
      productType: 'simple',
    });
    return {
      count: childrenCount,
      message: childrenCount === 0 ? 'No products found' : undefined,
    };
  } catch (err) {
    console.error('Service unicommerce fetchProductsCount error:', err);
    throw err;
  }
};

export const fetchProducts = async (sellerId, query = {}) => {
  try {
    const { pageNumber = 1, skus } = query;

    const sellerObjectId = new ObjectId(sellerId);
    const page = Math.max(parseInt(pageNumber) || 1, 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const skuArray = skus
      ? skus
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    let parents = [];
    if (skuArray.length) {
      const skuProducts = await Product.find({
        sellerId: sellerObjectId,
        status: 'active',
        productSkuCode: { $in: skuArray },
      })
        .select('productSkuCode parentProductSkuCode grandParentProductSkuCode')
        .lean();

      if (!skuProducts.length) {
        return { message: 'No products found for the provided SKUs' };
      }
      const parentSkus = [
        ...new Set(skuProducts.map((p) => p.parentProductSkuCode || p.grandParentProductSkuCode || p.productSkuCode)),
      ];

      parents = await Product.find({
        sellerId: sellerObjectId,
        status: 'active',
        productSkuCode: { $in: parentSkus },
      })
        .select('-__v')
        .lean();
    } else {
      parents = await Product.find({
        sellerId: sellerObjectId,
        status: 'active',
        $or: [
          { productType: 'configurable' },
          {
            productType: 'simple',
            parentProductSkuCode: null,
            grandParentProductSkuCode: null,
          },
        ],
      })
        .select('-__v')
        .skip(skip)
        .limit(limit)
        .lean();
    }

    if (!parents.length) {
      return { message: 'No products found' };
    }

    const parentSkus = parents.map((p) => p.productSkuCode);

    const childFilter = {
      sellerId: sellerObjectId,
      status: 'active',
      parentProductSkuCode: { $in: parentSkus },
    };

    if (skuArray.length) {
      childFilter.productSkuCode = { $in: skuArray };
    }

    const children = await Product.find(childFilter).select('-__v').lean();

    const childrenMap = mapChildrenByParent(children);

    const formattedProducts = parents
      .map((parent) => {
        let variants = childrenMap.get(parent.productSkuCode) || [];
        if (!variants.length) {
          variants = [parent];
        }
        return formatProduct(parent, variants);
      })
      .filter(Boolean);
    return { products: formattedProducts };
  } catch (error) {
    console.error('fetchProducts service error:', error);
    throw error;
  }
};

export default {
  fetchProductsCount,
  fetchProducts,
};
