import { createERPAdapter } from '../../base/ERPFactory.js';
import { processInBatches } from '../helpers/batchHelper.js';
import { formatNebimOrders } from '../helpers/formatter.js';
import { handleNebimError } from '../util/handleError.js';
const adapter = createERPAdapter('nebim');

const fetchAndPushOrderInToNebim = async (order, sellerId) => {
  try {
    const formattedOrders = await formatNebimOrders(order, sellerId);
    await processInBatches(formattedOrders, 100, async (batch) => {
      await adapter.pushOrders(batch);
    });
    return { pushed: formattedOrders.length };
  } catch (err) {
    await handleNebimError(err, 'fetchAndPushOrderInToNebim');
  }
};

export default {
  fetchAndPushOrderInToNebim,
};
