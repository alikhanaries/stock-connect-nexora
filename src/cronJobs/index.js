import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getReportToken } from '#service/forwardShipmentService.js';
import { runInventorySync } from './services/inventorySyncService.js';
import { config } from '../config/config.js';

const scheduledCronJobs = () => {
  if (config.NODE_ENV !== 'production') {
    return;
  }
  try {
    // Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      try {
        await getReportToken();
        await getReturns();
        await runInventorySync();
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
