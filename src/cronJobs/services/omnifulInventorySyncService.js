import { syncOmnifulWarehouseInventory } from '#service/omnifulInventoryService.js';

let isRunning = false;

export const runOmnifulWarehouseInventorySync = async () => {
  if (isRunning) {
    console.warn('[OmnifulInventorySync] Previous run still in progress — skipping this tick');
    return;
  }

  isRunning = true;
  console.log('[OmnifulInventorySync] Started');

  try {
    const result = await syncOmnifulWarehouseInventory({ trigger: 'cron' });
    console.log('[OmnifulInventorySync] Completed', result);
  } catch (error) {
    console.error('[OmnifulInventorySync] Failed:', error.message);
  } finally {
    isRunning = false;
  }
};

export default { runOmnifulWarehouseInventorySync };
