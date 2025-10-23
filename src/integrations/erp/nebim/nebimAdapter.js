import { fetchFromNebim } from './util/fetch.js';
import { handleNebimError } from './util/handleError.js';
import { NEBIM_ENDPOINTS } from '../../erp/nebim/constants/common.js';

export const createNebimAdapter = () => {
  return {
    pushOrders: async (orders = []) => {
      try {
        if (!Array.isArray(orders) || orders.length === 0) {
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
