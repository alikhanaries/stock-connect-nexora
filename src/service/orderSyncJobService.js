import { randomUUID } from 'node:crypto';
import SyncJob from '#models/SyncJob.js';
import orderService from '#service/orderService.js';
import shipmentService from '#service/shipmentService.js';
import { updateSyncDate } from '#helpers/updateSyncDate.js';
import { config } from '#config/config.js';
import { getSyncedOrdersOcp } from '../integrations/erp/ocp/services/orderServices.js';

/**
 * Creates a new SyncJob in MongoDB and returns its jobId.
 * The actual sync is executed separately via runOrderSyncInBackground().
 *
 * @param {string} sellerId
 * @param {string} userId
 * @returns {Promise<string>} jobId
 */
export async function createOrderSyncJob(sellerId, userId) {
  const jobId = randomUUID();
  await SyncJob.create({
    jobId,
    type: 'ORDER',
    sellerId: sellerId || null,
    userId: userId || null,
    status: 'pending',
    progress: 0,
    currentPhase: 'Initialising sync...',
  });
  return jobId;
}

/**
 * Reads the current status of a sync job by its jobId.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getOrderSyncJob(jobId) {
  return SyncJob.findOne({ jobId }).lean();
}

/**
 * Helper to update SyncJob progress in a single DB write.
 */
async function updateProgress(jobId, patch) {
  try {
    await SyncJob.findOneAndUpdate({ jobId }, { $set: patch });
  } catch (err) {
    // Non-critical — don't let a progress update failure abort the sync
    console.error(`[sync-job][${jobId}] Failed to update progress:`, err.message);
  }
}

/**
 * Runs the full order sync as a detached background process.
 * Updates SyncJob progress at each phase so the frontend can poll it.
 *
 * Phase map:
 *  10% — Fetching orders from ChannelEngine
 *  40% — Saving orders to DB (CE)
 *  60% — OCP sync (if enabled)
 *  80% — Acknowledging new orders with CE
 *  95% — Syncing shipment details
 * 100% — Complete
 *
 * @param {string} jobId
 * @param {string} sellerId
 * @param {string} userId
 */
export async function runOrderSyncInBackground(jobId, sellerId, userId) {
  const tag = `[order-sync][job=${jobId}]`;

  // Mark as running
  await updateProgress(jobId, {
    status: 'running',
    startedAt: new Date(),
    progress: 5,
    currentPhase: 'Initialising sync...',
  });

  try {
    // ── PHASE 1 (10%) ── Fetch new/changed orders from ChannelEngine ──────────
    await updateProgress(jobId, {
      progress: 10,
      currentPhase: 'Fetching orders from ChannelEngine...',
    });

    let orders = [];
    try {
      const { success, data } = await orderService.getNewOrders(tag);
      if (!success) {
        throw new Error('ChannelEngine returned success=false when fetching orders');
      }
      orders = data || [];
    } catch (err) {
      console.error(`${tag} PHASE 1 FAILED:`, err.message);
      throw err;
    }

    // No new orders — complete immediately
    if (orders.length === 0) {
      await updateProgress(jobId, {
        status: 'completed',
        progress: 100,
        currentPhase: 'Already up to date — no new orders found.',
        totalItems: 0,
        syncedItems: 0,
        completedAt: new Date(),
      });
      console.log(`${tag} No new orders. Sync complete.`);
      return;
    }

    await updateProgress(jobId, {
      totalItems: orders.length,
      progress: 20,
      currentPhase: `Found ${orders.length} order(s) — processing...`,
    });

    // ── PHASE 2 (40%) ── Save/process orders to DB + OCP sync ────────────────
    await updateProgress(jobId, {
      progress: 40,
      currentPhase: 'Saving orders to database...',
    });

    const runOcpSync = async () => {
      if (!config.IS_OCP_ORDER_SYNC_ENABLED) {
        return { success: true, message: 'OCP order sync is disabled' };
      }
      return getSyncedOrdersOcp(sellerId);
    };

    const [dataSavedInDb, ocpResult] = await Promise.allSettled([
      orderService.processOrders(orders, sellerId, tag),
      runOcpSync(),
    ]);

    if (dataSavedInDb.status === 'rejected') {
      console.error(`${tag} PHASE 2 processOrders REJECTED:`, dataSavedInDb.reason);
    }
    if (ocpResult.status === 'rejected') {
      console.error(`${tag} PHASE 2 OCP sync REJECTED:`, ocpResult.reason);
    }

    const isChannelEngineSuccess = dataSavedInDb.status === 'fulfilled' && dataSavedInDb.value?.success;
    const isOcpSuccess = ocpResult.status === 'fulfilled' && ocpResult.value?.success;

    if (!isChannelEngineSuccess && !isOcpSuccess) {
      const errorMessages = [
        dataSavedInDb.status === 'rejected' ? dataSavedInDb.reason?.message : dataSavedInDb.value?.message,
        ocpResult.status === 'rejected' ? ocpResult.reason?.message : ocpResult.value?.message,
      ]
        .filter(Boolean)
        .join('; ');
      throw new Error(errorMessages || 'All sync operations failed');
    }

    const ceData = dataSavedInDb.status === 'fulfilled' ? dataSavedInDb.value?.data : null;
    const ocpUpserted = (ocpResult.status === 'fulfilled' && ocpResult.value?.data?.upsertedCount) || 0;

    const sellerSyncCount = (ceData?.sellerOrdersSynced || 0) + (ceData?.sellerOrdersBackfilledForSeller || 0);
    const globalSyncCount =
      (ceData?.upsertedCount || 0) + (ceData?.modifiedCount || 0) + (ceData?.sellerOrdersBackfilled || 0);
    const newUpdateCount = (sellerSyncCount > 0 ? sellerSyncCount : globalSyncCount) + ocpUpserted;

    await updateProgress(jobId, {
      syncedItems: newUpdateCount,
      progress: 60,
      currentPhase: `Processed ${newUpdateCount} order(s) — updating sync records...`,
    });

    // ── PHASE 3 (60%) ── Update seller sync date ──────────────────────────────
    try {
      await updateSyncDate(sellerId, 'ORDER', newUpdateCount);
    } catch (err) {
      console.error(`${tag} PHASE 3 updateSyncDate failed (non-fatal):`, err.message);
    }

    // ── PHASE 4 (80%) ── Acknowledge new orders with ChannelEngine ────────────
    await updateProgress(jobId, {
      progress: 80,
      currentPhase: 'Acknowledging new orders with ChannelEngine...',
    });

    const processedOrderIds = new Set((ceData?.processedOrderIds || []).map(String));
    const newOrdersToAcknowledge = orders.filter(
      (order) => (order.Status === 'NEW' || !order.MerchantOrderNo) && processedOrderIds.has(String(order.Id))
    );

    if (newOrdersToAcknowledge.length > 0) {
      // Fire-and-forget acknowledgements (already async in the original code)
      orderService.backgroundAcknowledgementOrders(newOrdersToAcknowledge, tag);
    }

    // ── PHASE 5 (95%) ── Sync shipment details ────────────────────────────────
    await updateProgress(jobId, {
      progress: 95,
      currentPhase: 'Syncing shipment details...',
    });

    shipmentService?.getChannelEngineShipmentDetailsService(userId).catch((err) => {
      console.error(`${tag} PHASE 5 Shipment sync failed (non-fatal):`, err.message);
    });

    // ── DONE (100%) ───────────────────────────────────────────────────────────
    const doneMessage = newUpdateCount > 0 ? `${newUpdateCount} order(s) synced successfully` : 'No new orders found';

    await updateProgress(jobId, {
      status: 'completed',
      progress: 100,
      currentPhase: doneMessage,
      completedAt: new Date(),
    });

    console.log(`${tag} Sync complete — ${doneMessage}`);
  } catch (err) {
    console.error(`${tag} Sync FAILED:`, err.message);
    await updateProgress(jobId, {
      status: 'failed',
      currentPhase: 'Sync failed',
      errorMessage: err.message || 'An unexpected error occurred during sync',
      completedAt: new Date(),
    });
  }
}
