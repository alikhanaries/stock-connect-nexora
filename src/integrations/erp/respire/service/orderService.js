import { respireConfig } from '#root/src/integrations/erp/respire/config/config.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';
import { mapOrderToRespire } from '../helpers/orderMapper.js';

const BATCH_SIZE = 10;

export const createRespireOrder = async (orders = []) => {
  if (!orders.length) return;

  const authToken = await getAccessToken();
  const url = `${respireConfig.RESPIRE_BASE_URL}order/`;

  const MAX_RETRIES = 5;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((o) => o.Id).join(', ');
    const mappedBatch = await Promise.all(batch.map(mapOrderToRespire));

    let lastError = null;
    const payloadBody = JSON.stringify({ list: mappedBatch });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
          },
          body: payloadBody,
        });

        const data = await response.json();

        if (!response.ok) {
          lastError = `status=${response.status} | error: ${JSON.stringify(data)}`;
          console.warn(`[Respire] attempt ${attempt}/${MAX_RETRIES} FAILED batch [${batchIds}] | ${lastError}`);
          continue;
        }

        lastError = null;
        break;
      } catch (err) {
        lastError = err.message;
        console.warn(
          `[Respire] attempt ${attempt}/${MAX_RETRIES} FAILED batch [${batchIds}] | exception: ${err.message}`
        );
      }

      if (attempt < MAX_RETRIES && lastError) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
};

export const pushRespireOrders = (orders) => {
  createRespireOrder(orders).catch((err) => console.error('createRespireOrder error:', err));
};
