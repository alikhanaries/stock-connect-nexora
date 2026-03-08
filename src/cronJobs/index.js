import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getInventorySkuStatus } from '#service/inventoryStatusService.js';

const fetchReturnsCron = () => {
  try {
    // Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      console.log('Cron runs every day at 12:00 AM');
      try {
        await getReturns();
        console.log('Return data fetched');
      } catch (err) {
        console.error('Error fetching returns:', err.message);
      }
    });
  } catch (error) {
    console.error('Error scheduling cron:', error.message);
  }
};

const fetchInventoryStatusCron = () => {
  try {
    // Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      console.log('Cron runs every day at 12:00 AM');
      try {
        await getInventorySkuStatus();
        console.log('Inventory status data fetched');
      } catch (err) {
        console.error('Error fetching inventory status:', err.message);
      }
    });
  } catch (error) {
    console.error('Error scheduling cron:', error.message);
  }
};

export default {
  fetchReturnsCron,
  fetchInventoryStatusCron,
};
