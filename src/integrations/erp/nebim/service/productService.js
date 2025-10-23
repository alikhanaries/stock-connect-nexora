import Product from '#root/src/models/Product.js';
import { createERPAdapter } from '../../base/ERPFactory.js';
import { formatNebimProducts } from '../helpers/formatter.js';
import { handleNebimError } from '../util/handleError.js';

const adapter = createERPAdapter('nebim');

export const fetchAndStoreNebimProducts = async (sellerId) => {
  try {
    const rawProducts = await adapter.fetchProducts();
    if (!rawProducts?.length) return;

    const canonicalProducts = await formatNebimProducts(rawProducts, sellerId, 100);

    const bulkOps = canonicalProducts.map((product) => ({
      updateOne: {
        filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
        update: { $set: product },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps, { ordered: false });
    }
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
  }
};
