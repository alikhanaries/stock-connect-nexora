import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { runDbBackup } from '../util/dbBackup.js';

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

const dbBackupCron = () => {
  try {
    // Runs every day at 12:00 AM UTC
    cron.schedule(
      '0 0 * * *',
      async () => {
        console.log('DB backup cron started (12:00 AM UTC)');
        try {
          await runDbBackup();
          console.log('DB backup completed');
        } catch (err) {
          console.error('Error running DB backup:', err.message);
        }
      },
      {
        timezone: 'UTC',
      }
    );
  } catch (error) {
    console.error('Error scheduling DB backup cron:', error.message);
  }
};

export default {
  fetchReturnsCron,
  dbBackupCron,
};
