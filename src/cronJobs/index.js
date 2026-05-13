import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getReportToken } from '#service/forwardShipmentService.js';

const scheduledCronJobs = () => {
  try {
    // Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      try {
        await getReportToken();
        await getReturns();
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
