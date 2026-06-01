import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';
import { mapOrderToEntegra } from '../helpers/orderMapper.js';

const BATCH_SIZE = 10;

export const createEntegraOrder = async (orders = []) => {
  if (!orders.length) return;

  const authToken = await getAccessToken();
  const url = `${entegraConfig.ENTEGRA_BASE_URL}order/`;

  let successCount = 0;
  let failCount = 0;

  const MAX_RETRIES = 5;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map((o) => o.Id).join(', ');
    const mappedBatch = batch.map(mapOrderToEntegra);

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ list: mappedBatch }),
        });

        const data = await response.json();

        if (!response.ok) {
          lastError = `status=${response.status} | error: ${JSON.stringify(data)}`;
          console.warn(`[Entegra] attempt ${attempt}/${MAX_RETRIES} FAILED batch [${batchIds}] | ${lastError}`);
          continue;
        }

        successCount += batch.length;
        console.log(`[Entegra] SUCCESS batch [${batchIds}] | attempt=${attempt}`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err.message;
        console.warn(
          `[Entegra] attempt ${attempt}/${MAX_RETRIES} FAILED batch [${batchIds}] | exception: ${err.message}`
        );
      }

      if (attempt < MAX_RETRIES && lastError) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (lastError) {
      failCount += batch.length;
      console.error(`[Entegra] GAVE UP batch [${batchIds}] after ${MAX_RETRIES} attempts | last error: ${lastError}`);
    }
  }

  console.log(
    `[Entegra] Order push complete — success: ${successCount}, failed: ${failCount}, total: ${orders.length}`
  );
};

export const pushEntegraOrders = (orders) => {
  createEntegraOrder(orders).catch((err) => console.error('createEntegraOrder error:', err));
};
