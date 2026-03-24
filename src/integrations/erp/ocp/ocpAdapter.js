import { errorLog } from '#root/src/middleware/errorLogMiddleware.js';
import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { ocpEndPoints } from './config/config.js';

import { cancelFullOrderOcp, cancelPartialOrderOcp, fetchFromOcp } from './utils/fetch.js';

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
    cancelFullOrder: async (options = {}) => {
      try {
        const { ocpBrandSlug, reason, ocpOrderId } = options;
        const payload = {
          message: reason,
        };
        const data = await cancelFullOrderOcp(ocpEndPoints.OCP_ORDERS, ocpOrderId, {
          method: 'PUT',
          body: payload,
          headers: {
            'x-ocp-tenant-slug': ocpBrandSlug,
          },
        });

        return data;
      } catch (err) {
        console.error(err);
        errorLog(err);
        throw err;
      }
    },

    partialCancelOrderOcp: async (options = {}) => {
      try {
        const { ocpBrandSlug, reason, ocpOrderId, cancelItems } = options;
        const payload = {
          message: reason,
          cancelItems: cancelItems,
        };
        const data = await cancelPartialOrderOcp(ocpEndPoints.OCP_ORDERS, ocpOrderId, {
          method: 'PUT',
          body: payload,
          headers: {
            'x-ocp-tenant-slug': ocpBrandSlug,
          },
        });
        return data;
      } catch (err) {
        console.error(err);
        errorLog(err);
        throw err;
      }
    },
  };
};
