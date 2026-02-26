import Product from '#root/src/models/Product.js';
import { ObjectId } from 'mongodb';

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

export default {
  fetchProductsCount,
};
