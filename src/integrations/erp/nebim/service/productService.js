import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
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
    return canonicalProducts;
    /**
     * TODO [DB WRITE - FRONTEND INTEGRATION PENDING]:
     * Once frontend integration is complete, add code here to persist
     * canonicalProducts to the database (e.g., Product.bulkWrite or equivalent).
     * For now, products are prepared but not stored.
     */
  } catch (err) {
    await handleNebimError(err, 'fetchAndStoreNebimProducts');
  }
};
