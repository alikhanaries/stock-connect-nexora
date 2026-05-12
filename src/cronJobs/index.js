import cron from 'node-cron';
import { getReturns } from '#service/returnService.js';
import { getInventorySkuStatus } from '#service/inventoryStatusService.js';
import { getReportToken } from '#service/forwardShipmentService.js';
import { pushOrdersService as pushExquiseOrdersService } from '#root/src/integrations/erp/shopify/exquise/service/orderService.js';
import Seller from '#root/src/models/Seller.js';

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
    // Exquise Shopify order sync - Runs every day at 12:00 AM
    cron.schedule('0 0 * * *', async () => {
      try {
        const sellers = await Seller.find(
          {
            'shopifyConfig.url': { $exists: true, $ne: null },
            'integrations.exquise.enabled': true,
          },
          { _id: 1 }
        ).lean();

        for (const seller of sellers) {
          try {
            await pushExquiseOrdersService(String(seller._id));
          } catch (err) {
            console.error(`[ExquiseOrderSync] Cron failed for seller ${seller._id}:`, err.message);
          }
        }
      } catch (err) {
        console.error('[ExquiseOrderSync] Cron error:', err.message);
      }
    });
  } catch (error) {
    console.error('Error scheduling cron:', error.message);
  }
};

export default {
  scheduledCronJobs,
};
