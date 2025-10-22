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
