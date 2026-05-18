import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getReportToken } from '#service/forwardShipmentService.js';
import { pushOrdersService } from '#root/src/integrations/erp/shopify/catch/service/orderService.js';
import Seller from '#root/src/models/Seller.js';

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

    // Catch Shopify order sync - Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      try {
        const sellers = await Seller.find({ 'shopifyConfig.url': { $exists: true, $ne: null } }, { _id: 1 }).lean();

        for (const seller of sellers) {
          try {
            await pushOrdersService(String(seller._id));
          } catch (err) {
            console.error(`[CatchOrderSync] Cron failed for seller ${seller._id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[CatchOrderSync] Cron error:', err.message);
      }
    });
  } catch (error) {
    console.error('Error scheduling cron:', error.message);
  }
};

export default {
  scheduledCronJobs,
};
