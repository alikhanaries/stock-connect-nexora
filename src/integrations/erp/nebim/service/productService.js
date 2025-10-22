import Product from '#root/src/models/Product.js';
import { createERPAdapter } from '../../base/ERPFactory.js';
import { formatNebimProducts } from '../helpers/formatter.js';
import { handleNebimError } from '../util/handleError.js';

const adapter = createERPAdapter('nebim');

export const fetchAndStoreNebimProducts = async (sellerId) => {
  try {
    const rawProducts = await adapter.fetchProducts();
    if (!rawProducts || !rawProducts.length) {
      return { totalInserted: 0, totalUpdated: 0 };
    }
    const canonicalProducts = await formatNebimProducts(rawProducts, sellerId, 100);
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;
    for (const product of canonicalProducts) {
      const result = await Product.updateOne(
        { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
        { $set: product },
        { upsert: true }
      );

      if (result.upsertedCount > 0) totalInserted++;
      else if (result.modifiedCount > 0) totalUpdated++;
      else totalUnchanged++;
    }
    return { totalInserted, totalUpdated, totalUnchanged };
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
    return { totalInserted: 0, totalUpdated: 0 };
  }
};
