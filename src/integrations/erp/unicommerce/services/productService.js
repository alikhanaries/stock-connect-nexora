import Product from '#root/src/models/Product.js';
import { ObjectId } from 'mongodb';

export const fetchProductsCount = async (sellerId, publishedStatus) => {
  try {
    let filter = {
      sellerId: new ObjectId(sellerId),
    };

    if (publishedStatus.toUpperCase() === 'PUBLISHED') {
      filter.status = 'active';
    }

    let productCount = await Product.countDocuments(filter);

    return {
      count: productCount,
    };
  } catch (err) {
    console.error('Service unicommerce fetchProductsCount error:', err);
    throw err;
  }
};

export default {
  fetchProductsCount,
};
