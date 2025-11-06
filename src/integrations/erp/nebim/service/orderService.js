import { createERPAdapter } from '../../base/ERPFactory.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
import { processInBatches } from '#root/src/integrations/common/helpers/batchHelper.js';
import { formatNebimOrders } from '../helpers/formatter.js';
import { handleNebimError } from '../util/handleError.js';
const { MAX_BATCH_SIZE } = erpCommonConfig;
const adapter = createERPAdapter('nebim');

const fetchAndPushOrderInToNebim = async (order, sellerId) => {
  try {
    const formattedOrders = await formatNebimOrders(order, sellerId);
    await processInBatches(formattedOrders, MAX_BATCH_SIZE, async (batch) => {
      await adapter.pushOrders(batch);
    });
  } catch (err) {
    await handleNebimError(err, 'fetchAndPushOrderInToNebim');
  }
};
export default {
  fetchAndPushOrderInToNebim,
};
