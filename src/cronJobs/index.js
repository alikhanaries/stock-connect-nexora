import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getInventorySkuStatus } from '#service/inventoryStatusService.js';
import { getReportToken } from '#service/forwardShipmentService.js';

const scheduledCronJobs = () => {
  try {
    // Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      console.log('scheduled cron jobs started');
      try {
        await getReportToken();
        console.log('Access token refreshed');
        await getReturns();
        console.log('Return data fetched');

        await getInventorySkuStatus();
        console.log('Inventory status data fetched');
      } catch (err) {
        console.error('Error executing scheduled cron job:', err.message);
      }
    });
  } catch (error) {
    console.error('Error scheduling cron:', error.message);
  }
};

export default {
  scheduledCronJobs,
};
