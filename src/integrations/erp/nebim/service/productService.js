import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
// import Product from '#root/src/models/Product.js';
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
    console.log(`Prepared ${canonicalProducts.length} products (DB write disabled)`);

    /**
     * TODO [TEMPORARY DISABLE - FRONTEND INTEGRATION]:
     * Database write operations are currently disabled.
     * Reason: To prevent premature data storage before frontend integration is finalized.
     * Action: Uncomment the code below once frontend integration is complete.
     */

    // const bulkOps = canonicalProducts.map((product) => ({
    //   updateOne: {
    //     filter: { productSkuCode: product.productSkuCode, sellerId: product.sellerId },
    //     update: { $set: product },
    //     upsert: true,
    //   },
    // }));

    // if (bulkOps.length > 0) {
    //   await Product.bulkWrite(bulkOps, { ordered: false });
    // }
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
  }
};
