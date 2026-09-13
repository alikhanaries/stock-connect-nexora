import { isSentosConfigured } from '../config/config.js';
import { sentosFetch } from '../utils/fetch.js';
import { mapOrderToSentos } from '../helpers/orderMapper.js';

export const createSentosOrder = async (orders = []) => {
  if (!isSentosConfigured() || !orders.length) return;

  for (const order of orders) {
    try {
      const payload = await mapOrderToSentos(order);
      await sentosFetch('orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`[Sentos Order Push] Failed for order ${order?.Id}:`, err.message);
    }
  }
};

export const pushSentosOrders = (orders = []) => {
  if (!isSentosConfigured() || !orders.length) return;
  createSentosOrder(orders).catch((err) => console.error('[Sentos Order Push] error:', err.message));
};
