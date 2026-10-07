import { config } from '#config/config.js';
import { channelEnginePush } from '#service/channelEngineClient.js';
import { CE_QUEUE_OPERATIONS } from '#constants/channelEngineQueue.js';
import { fetchWithRetry } from '#utils/fetchWithRetry.js';

const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

/**
 * ChannelEngine adapter — encapsulates CE URLs, queue operations, and direct HTTP reads.
 * Business services must use getCommerceProvider() rather than calling this class directly.
 */
export class ChannelEngineCommerceProvider {
  get id() {
    return 'channel-engine';
  }

  pushQueued(options) {
    return channelEnginePush(options);
  }

  fetchOrdersPage(page, pageSize) {
    return fetchWithRetry(
      `${CHANNEL_ENGINE_BASE_URL}orders?apiKey=${CHANNEL_ENGINE_API_KEY}&page=${page}&pageSize=${pageSize}`
    );
  }

  postOrderCancellation(body, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.ORDER_CANCELLATION,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}cancellations?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: options.headers,
      body,
      sellerId: options.sellerId,
      awaitResult: options.awaitResult,
    });
  }

  postOrderAcknowledge(body, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.ORDER_ACKNOWLEDGE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}orders/acknowledge?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: options.headers ?? { 'Content-Type': 'application/json' },
      body,
      batchId: options.batchId,
      awaitResult: options.awaitResult ?? false,
    });
  }

  fetchChannels() {
    return fetch(`${CHANNEL_ENGINE_BASE_URL}channels?apiKey=${CHANNEL_ENGINE_API_KEY}`);
  }

  fetchChannelProductsPage(channelId, page, pageSize) {
    const url =
      `${CHANNEL_ENGINE_BASE_URL}channels/${channelId}/products` +
      `?apiKey=${encodeURIComponent(CHANNEL_ENGINE_API_KEY)}` +
      `&page=${page}&pageSize=${pageSize}`;
    return fetch(url);
  }

  async getProductsByMerchantSkuList(skuList = []) {
    if (!skuList.length) return [];
    try {
      const params = new URLSearchParams({
        apiKey: CHANNEL_ENGINE_API_KEY,
      });
      skuList.forEach((sku) => {
        params.append('merchantProductNoList', sku);
      });

      const response = await fetchWithRetry(`${CHANNEL_ENGINE_BASE_URL}products?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`ChannelEngine GET failed with status ${response.status}`);
      }
      const data = await response.json();
      return data?.Content || [];
    } catch (err) {
      console.error('Error fetching from ChannelEngine:', err);
      return [];
    }
  }

  postProductsBulkDelete(skuCodes) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.PRODUCTS_BULK_DELETE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}products/bulkdelete?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: skuCodes,
    });
  }

  patchProductsExtraDataBulk(bulkPayload) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.PRODUCTS_EXTRA_DATA,
      method: 'PATCH',
      url: `${CHANNEL_ENGINE_BASE_URL}products/extra-data/bulk?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: bulkPayload,
    });
  }

  postProductsFreeze(payload) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.PRODUCTS_FREEZE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}products/freeze`,
      headers: {
        'Content-Type': 'application/json',
        'X-CE-KEY': CHANNEL_ENGINE_API_KEY,
      },
      body: payload,
    });
  }

  postProducts(batch, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.PRODUCTS_PUSH,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}products?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: batch,
      sellerId: options.sellerId,
      batchId: options.batchId,
      metadata: options.metadata,
      awaitResult: options.awaitResult ?? false,
    });
  }

  putOfferStock(stockUpdates, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.OFFER_STOCK,
      method: 'PUT',
      url: `${CHANNEL_ENGINE_BASE_URL}offer/stock?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: stockUpdates,
      sellerId: options.sellerId,
      batchId: options.batchId,
      awaitResult: options.awaitResult ?? false,
    });
  }

  putOfferPrice(priceUpdates, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.OFFER_PRICE,
      method: 'PUT',
      url: `${CHANNEL_ENGINE_BASE_URL}offer?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body: priceUpdates,
      sellerId: options.sellerId,
      batchId: options.batchId,
      awaitResult: options.awaitResult ?? false,
    });
  }

  patchProductsExtraDataBulkForPrice(mariketPriceUpdates, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.PRODUCTS_EXTRA_DATA,
      method: 'PATCH',
      url: `${CHANNEL_ENGINE_BASE_URL}products/extra-data/bulk?apiKey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: mariketPriceUpdates,
      sellerId: options.sellerId,
      batchId: options.batchId,
      awaitResult: options.awaitResult ?? false,
    });
  }

  postShipment(body, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.SHIPMENT_CREATE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}shipments?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: options.headers ?? { 'Content-Type': 'application/json' },
      body,
      awaitResult: options.awaitResult,
    });
  }

  putShipmentDeliveryState(merchantShipmentNo, body) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.SHIPMENT_DELIVERY_STATE,
      method: 'PUT',
      url: `${CHANNEL_ENGINE_BASE_URL}shipments/${merchantShipmentNo}/delivery-state?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }

  fetchMerchantShipmentsPage(page, pageSize) {
    const url = `${CHANNEL_ENGINE_BASE_URL}shipments/merchant?apikey=${CHANNEL_ENGINE_API_KEY}&page=${page}&pageSize=${pageSize}`;
    return fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
  }

  fetchReturns(params) {
    const merged = new URLSearchParams(params);
    if (!merged.has('apikey')) {
      merged.set('apikey', CHANNEL_ENGINE_API_KEY);
    }
    return fetch(`${CHANNEL_ENGINE_BASE_URL}returns?${merged.toString()}`);
  }

  postReturnMerchant(returnData) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_MERCHANT_CREATE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}returns/merchant?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: returnData,
    });
  }

  postReturnMerchantAcknowledge(ackData, options = {}) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_MERCHANT_ACKNOWLEDGE,
      method: 'POST',
      url: `${CHANNEL_ENGINE_BASE_URL}returns/merchant/acknowledge?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: options.headers ?? { 'Content-Type': 'application/json' },
      body: ackData,
      sellerId: options.sellerId,
    });
  }

  putReturnAcceptReject(returnData) {
    return channelEnginePush({
      operationType: CE_QUEUE_OPERATIONS.RETURN_ACCEPT_REJECT,
      method: 'PUT',
      url: `${CHANNEL_ENGINE_BASE_URL}returns?apikey=${CHANNEL_ENGINE_API_KEY}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: returnData,
    });
  }

  fetchOrderInvoice(merchantOrderNo, fetchOptions = {}, { apiKeyQueryName = 'apikey' } = {}) {
    const url = `${CHANNEL_ENGINE_BASE_URL}orders/${merchantOrderNo}/invoice?${apiKeyQueryName}=${CHANNEL_ENGINE_API_KEY}`;
    return fetch(url, fetchOptions);
  }
}
