import orderService from '#service/orderService.js';

/**
 * Service to process ChannelEngine Order Webhook events (ORDERS_CREATE, ORDERS_CHANGE).
 * Handles direct order payloads or delta queries, updates database, and acknowledges new orders.
 *
 * @param {object|array} payload - Incoming webhook payload
 * @param {object} query - Incoming query parameters (e.g. { type: 'orders', tenant: '...', updatedSince: '...' })
 * @param {string} parentTag - Logging tag for tracing
 */
export const processChannelEngineOrderWebhook = async (payload, query = {}, parentTag) => {
  const tag = parentTag || `[ce-order-webhook][${Date.now()}]`;
  try {
    console.log(`${tag} Processing ChannelEngine order webhook with query:`, query);

    let ordersToProcess = [];

    if (Array.isArray(payload) && payload.length > 0) {
      ordersToProcess = payload;
    } else if (payload?.Content && Array.isArray(payload.Content)) {
      ordersToProcess = payload.Content;
    } else if (payload?.Id || payload?.MerchantOrderNo) {
      ordersToProcess = [payload];
    }

    // If payload didn't contain full order items directly (e.g. ping with updatedSince), fetch from ChannelEngine API
    if (!ordersToProcess.length) {
      console.log(`${tag} No direct order payload in body, fetching new/changed orders from ChannelEngine API...`);
      const { success, data } = await orderService.getNewOrders(tag);
      if (success && Array.isArray(data)) {
        ordersToProcess = data;
      }
    }

    if (!ordersToProcess.length) {
      console.log(`${tag} No orders to process.`);
      return { success: true, message: 'No orders to process', count: 0 };
    }

    console.log(`${tag} Processing ${ordersToProcess.length} order(s)...`);
    const dataSavedInDb = await orderService.processOrders(ordersToProcess, undefined, tag);

    if (dataSavedInDb?.success) {
      const processedOrderIds = new Set((dataSavedInDb?.data?.processedOrderIds || []).map(String));
      const newOrdersToAcknowledge = ordersToProcess.filter(
        (order) => (order.Status === 'NEW' || !order.MerchantOrderNo) && processedOrderIds.has(String(order.Id))
      );

      if (newOrdersToAcknowledge.length > 0) {
        orderService.backgroundAcknowledgementOrders(newOrdersToAcknowledge, tag);
      }

      console.log(`${tag} Successfully processed and synced ${ordersToProcess.length} order(s).`);
      return {
        success: true,
        message: 'Webhook processed successfully',
        count: ordersToProcess.length,
        data: dataSavedInDb.data,
      };
    } else {
      console.error(`${tag} Failed to process orders:`, dataSavedInDb?.message);
      return { success: false, message: dataSavedInDb?.message || 'Failed to process orders' };
    }
  } catch (err) {
    console.error(`${tag} Webhook execution error:`, err);
    throw err;
  }
};
