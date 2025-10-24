import { NEBIM_ENDPOINTS } from '../../erp/nebim/constants/common.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { connectNebim } from './util/connect.js';
import { fetchFromNebim } from './util/fetch.js';
import { handleNebimError } from './util/handleError.js';

export const createNebimAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    connect: async () => {
      try {
        return await connectNebim();
      } catch (err) {
        console.error('Nebim connect error:', err.message);
        throw err;
      }
    },

    fetchProducts: async (options = {}) => {
      try {
        const payload = {
          ProcName: 'exquise_GetProductPriceAndInventory',
          ...options,
        };
        const data = await fetchFromNebim(NEBIM_ENDPOINTS.RUN_PROC, {
          method: 'POST',
          body: payload,
        });
        return data?.Data ?? data?.Result ?? data;
      } catch (err) {
        await handleNebimError(err, 'fetchProducts');
      }
    },
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
