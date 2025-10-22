import { nebimConfig as defaultConfig } from './config/config.js';
import { connectNebim } from './util/connect.js';
import { fetchFromNebim } from './util/fetch.js';
import { handleNebimError } from './util/handleError.js';
import { NEBIM_ENDPOINTS } from '../../erp/nebim/constants/common.js';

export const createNebimAdapter = (config = defaultConfig) => {
  const cfg = { ...defaultConfig, ...config };

  return {
    connect: async () => {
      try {
        return await connectNebim(cfg);
      } catch (err) {
        console.error('Nebim connect error:', err.message);
        throw err;
      }
    },

    pushOrders: async (orders = []) => {
      try {
        if (!Array.isArray(orders) || orders.length === 0) {
          console.warn('No orders to push to Nebim.');
          return { success: false, message: 'Empty order batch' };
        }
        const payload = { Orders: orders };

        const response = await fetchFromNebim(NEBIM_ENDPOINTS.PUSH_ORDER, {
          method: 'POST',
          body: payload,
        });
        return response;
      } catch (err) {
        await handleNebimError(err, 'pushOrders');
      }
    },
  };
};
