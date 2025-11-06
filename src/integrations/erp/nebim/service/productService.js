import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import Product from '#root/src/models/Product.js';
import { insertCategoryTrail } from '#root/src/service/categoryService.js';
import { createERPAdapter } from '../../base/ERPFactory.js';
import { formatNebimProducts } from '../helpers/formatter.js';
import { handleNebimError } from '../util/handleError.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;
const adapter = createERPAdapter('nebim');
export const fetchAndStoreNebimProducts = async (sellerId) => {
  try {
    const rawProducts = await adapter.fetchProducts();
    if (!rawProducts?.length) return;

    const canonicalProducts = await formatNebimProducts(rawProducts, sellerId, MAX_BATCH_SIZE);
    const categoryTrails = new Set();
    for (const product of canonicalProducts) {
      if (product.categoryTrail) categoryTrails.add(product.categoryTrail);
    }
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
    if (categoryTrails.size > 0) {
      await insertCategoryTrail([...categoryTrails], sellerId);
    }
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
  }
};
