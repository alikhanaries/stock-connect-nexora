import { errorLog } from '#root/src/middleware/errorLogMiddleware.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { ocpEndPoints } from './config/config.js';

import { fetchFromOcp } from './utils/fetch.js';

export const createOcpAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchOrders: async (options = {}) => {
      try {
        const { ocpBrandSlug, size = 10, ...queryParams } = options;
        const data = await fetchFromOcp(ocpEndPoints.OCP_ORDERS, {
          method: 'GET',
          query: {
            size,
            ...queryParams,
          },
          headers: {
            'x-ocp-tenant-slug': ocpBrandSlug,
          },
        });

        return data?.Data ?? data?.Result ?? data;
      } catch (err) {
        console.error(err);
        errorLog(err);
        throw err;
      }
    },
  };
};
