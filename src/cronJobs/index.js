import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';

const fetchReturnsCron = () => {
  try {
    cron.schedule('*/7 * * * * *', async () => {
      console.log('Cron runs every 7 seconds');
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

export default {
  fetchReturnsCron,
};
