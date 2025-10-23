import { NEBIM_ENDPOINTS } from '../../erp/nebim/constants/common.js';
import { fetchFromNebim } from './util/fetch.js';
import { handleNebimError } from './util/handleError.js';

export const createNebimAdapter = () => {
  return {
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
  };
};
