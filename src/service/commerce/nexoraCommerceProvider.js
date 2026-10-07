import { randomUUID } from 'node:crypto';
import { config } from '#config/config.js';
import { CommerceProviderError } from './CommerceProviderError.js';
import { nexoraRequest, nexoraPing } from './nexora/nexoraHttpClient.js';
import {
  mapNexoraProductToChannelEngineShape,
  mapChannelEngineProductToNexoraCreate,
  extractCeTargetStock,
  mapChannelEngineShipmentToNexora,
  mapNexoraChannelsToChannelEngineContent,
  mapNexoraShipmentToChannelEngineShape,
  buildCePagedOrdersBody,
  buildCeCancellationPushData,
} from './nexora/nexoraMappers.js';
import { buildFetchLikeResponse, buildPushLikeResponse } from './nexora/nexoraResponseHelpers.js';

function readEnv(key, fallback = '') {
  const fromEnv = process.env[key];
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim();
  }
  return (fallback || '').trim();
}

function unsupported(operation) {
  return new CommerceProviderError(`Nexora commerce provider does not support "${operation}"`, {
    provider: 'nexora',
    operation,
    externalCode: 'UNSUPPORTED_OPERATION',
  });
}

export class NexoraCommerceProvider {
  get id() {
    return 'nexora';
  }

  _unsupported(operation) {
    throw unsupported(operation);
  }

  ping() {
    return nexoraPing();
  }

  pushQueued() {
    this._unsupported('pushQueued');
  }

  async _fetchNexoraProductByMerchantSku(merchantSku) {
    const result = await nexoraRequest('GET', '/products', {
      operation: 'getProductByMerchantSku',
      query: { merchantSku: String(merchantSku) },
    });
    const payload = result.data ?? {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items[0] ?? null;
  }

  async _resolvePublishChannelId() {
    const configured = readEnv('NEXORA_PUBLISH_CHANNEL_ID', config.NEXORA_PUBLISH_CHANNEL_ID);
    if (configured) return configured;
    const channels = await this.fetchChannels();
    const body = await channels.json();
    const first = body?.Content?.[0]?.Channels?.[0]?.ChannelId;
    if (!first) {
      throw new CommerceProviderError('No Nexora channel available for product publish', {
        provider: 'nexora',
        operation: 'postProducts.publish',
        externalCode: 'CONFIGURATION_ERROR',
      });
    }
    return String(first);
  }

  async _listOrdersPage(page, pageSize) {
    let cursor;
    let payload = { items: [], hasMore: false, nextCursor: null };
    for (let currentPage = 1; currentPage <= page; currentPage += 1) {
      const result = await nexoraRequest('GET', '/orders', {
        operation: 'fetchOrdersPage',
        query: {
          limit: pageSize,
          ...(cursor ? { cursor } : {}),
        },
      });
      payload = result.data ?? {};
      if (currentPage === page) break;
      if (!payload.hasMore || !payload.nextCursor) {
        payload = { ...payload, items: [], hasMore: false };
        break;
      }
      cursor = payload.nextCursor;
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const hasMore = payload.hasMore ?? false;
    const totalCount = payload.totalCount ?? payload.total ?? null;

    return buildCePagedOrdersBody(items, { totalCount, page, pageSize, hasMore });
  }

  async fetchOrdersPage(page, pageSize) {
    const body = await this._listOrdersPage(page, pageSize);
    return buildFetchLikeResponse(200, body);
  }

  async _resolveOrderIdFromCancellationBody(body = {}) {
    if (body.OrderId != null && body.OrderId !== '') {
      return String(body.OrderId);
    }
    if (body.MerchantOrderNo) {
      const detail = await nexoraRequest('GET', `/orders/${encodeURIComponent(body.MerchantOrderNo)}`, {
        operation: 'postOrderCancellation.resolveOrder',
      });
      const order = detail.data ?? {};
      return String(order.orderId ?? order.id ?? body.MerchantOrderNo);
    }
    throw new CommerceProviderError('Order id is required for Nexora cancellation', {
      provider: 'nexora',
      operation: 'postOrderCancellation',
      externalCode: 'VALIDATION_ERROR',
    });
  }

  async postOrderCancellation(body, options = {}) {
    const orderId = await this._resolveOrderIdFromCancellationBody(body);
    try {
      const result = await nexoraRequest('POST', `/orders/${encodeURIComponent(orderId)}/cancel`, {
        operation: 'postOrderCancellation',
        body: {
          reason: body.Reason ?? body.reason,
          reasonCode: body.ReasonCode ?? body.reasonCode,
          lines: body.Lines ?? body.lines,
          isMerchantCreator: body.IsMerchantCreator,
        },
      });
      const data = buildCeCancellationPushData(result.data ?? {}, result.status);
      return buildPushLikeResponse({ ok: true, status: result.status, data, rawText: result.rawText });
    } catch (err) {
      if (err instanceof CommerceProviderError && err.status === 409) {
        return buildPushLikeResponse({
          ok: false,
          status: 409,
          data: { StatusCode: 409, Message: err.message },
          rawText: err.message,
        });
      }
      if (options.awaitResult === false) {
        return buildPushLikeResponse({ ok: false, status: err.status ?? 500, data: { Message: err.message } });
      }
      throw err;
    }
  }

  postOrderAcknowledge() {
    this._unsupported('postOrderAcknowledge');
  }

  async fetchChannels() {
    const result = await nexoraRequest('GET', '/channels', { operation: 'fetchChannels' });
    const payload = result.data ?? {};
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [];
    const content = mapNexoraChannelsToChannelEngineContent(items);
    return buildFetchLikeResponse(200, { Content: content });
  }

  fetchChannelProductsPage() {
    this._unsupported('fetchChannelProductsPage');
  }

  async getProductsByMerchantSkuList(skuList = []) {
    if (!skuList.length) return [];
    try {
      const products = [];
      for (const sku of skuList) {
        const item = await this._fetchNexoraProductByMerchantSku(sku);
        if (item) products.push(mapNexoraProductToChannelEngineShape(item));
      }
      return products;
    } catch (err) {
      console.error('[nexora] getProductsByMerchantSkuList failed:', err.message);
      return [];
    }
  }

  postProductsBulkDelete() {
    this._unsupported('postProductsBulkDelete');
  }

  patchProductsExtraDataBulk() {
    this._unsupported('patchProductsExtraDataBulk');
  }

  postProductsFreeze() {
    this._unsupported('postProductsFreeze');
  }

  async _postProductsSync(items) {
    const created = [];
    for (const ceProduct of items) {
      const nexoraBody = mapChannelEngineProductToNexoraCreate(ceProduct);
      const createResult = await nexoraRequest('POST', '/products', {
        operation: 'postProducts.create',
        body: nexoraBody,
      });
      const productId = createResult.data?.id ?? createResult.data?.productId;
      if (productId) {
        const channelId = await this._resolvePublishChannelId();
        await nexoraRequest('POST', `/products/${encodeURIComponent(productId)}/publish`, {
          operation: 'postProducts.publish',
          body: { channelId },
          idempotencyKey: randomUUID(),
        }).catch((err) => {
          console.warn('[nexora] publish after create failed:', err.message);
        });
      }
      created.push(createResult.data);
    }
    return created;
  }

  async postProducts(batch, options = {}) {
    const items = Array.isArray(batch) ? batch : [batch];

    if (options.awaitResult === false) {
      void this._postProductsSync(items).catch((err) =>
        console.error('[nexora] async postProducts failed:', err.message)
      );
      return buildPushLikeResponse({
        ok: true,
        status: 202,
        data: { status: 'accepted', jobId: null, batchIndex: options.metadata?.batchIndex },
      });
    }

    const created = await this._postProductsSync(items);
    return buildPushLikeResponse({ ok: true, status: 200, data: created });
  }

  async _applyStockAdjustmentForEntry(entry) {
    const stockLocationId = readEnv('NEXORA_STOCK_LOCATION_ID', config.NEXORA_STOCK_LOCATION_ID);
    if (!stockLocationId) {
      throw new CommerceProviderError('NEXORA_STOCK_LOCATION_ID is required for inventory adjustments', {
        provider: 'nexora',
        operation: 'putOfferStock',
        externalCode: 'CONFIGURATION_ERROR',
      });
    }

    const sku = entry.MerchantProductNo ?? entry.sku;
    const targetStock = extractCeTargetStock(entry);
    if (targetStock == null || Number.isNaN(targetStock)) {
      throw new CommerceProviderError(`Invalid stock quantity for SKU ${sku}`, {
        provider: 'nexora',
        operation: 'putOfferStock',
        externalCode: 'VALIDATION_ERROR',
      });
    }

    const product = await this._fetchNexoraProductByMerchantSku(sku);
    const productId = product?.id;
    if (!productId) {
      throw new CommerceProviderError(`Product not found for SKU ${sku}`, {
        provider: 'nexora',
        operation: 'putOfferStock',
        externalCode: 'NOT_FOUND',
      });
    }

    const inventory = await nexoraRequest('GET', `/inventory/${encodeURIComponent(productId)}`, {
      operation: 'putOfferStock.lookupInventory',
    });
    const balances = inventory.data?.balances ?? [];
    const currentAvailable = balances.reduce((sum, row) => sum + (row.available ?? 0), 0);
    const quantityDelta = targetStock - currentAvailable;
    if (quantityDelta === 0) {
      return { productId, quantityDelta: 0, skipped: true };
    }

    const adjustment = await nexoraRequest('POST', '/inventory/adjustments', {
      operation: 'putOfferStock',
      body: {
        productId,
        stockLocationId,
        quantityDelta,
        reason: 'stockconnect-sync',
      },
      idempotencyKey: randomUUID(),
    });
    return adjustment.data;
  }

  async putOfferStock(stockUpdates, options = {}) {
    const updates = Array.isArray(stockUpdates) ? stockUpdates : [stockUpdates];

    const run = async () => {
      const results = [];
      for (const entry of updates) {
        results.push(await this._applyStockAdjustmentForEntry(entry));
      }
      return results;
    };

    if (options.awaitResult === false) {
      void run().catch((err) => console.error('[nexora] async putOfferStock failed:', err.message));
      return buildPushLikeResponse({ ok: true, status: 202, data: { status: 'queued' } });
    }

    const results = await run();
    return buildPushLikeResponse({ ok: true, status: 200, data: { success: true, results } });
  }

  putOfferPrice() {
    this._unsupported('putOfferPrice');
  }

  patchProductsExtraDataBulkForPrice() {
    this._unsupported('patchProductsExtraDataBulkForPrice');
  }

  async _resolveOrderIdForShipment(body = {}) {
    if (body.orderId) return String(body.orderId);
    const merchantOrderNo = body.MerchantOrderNo;
    if (!merchantOrderNo) {
      throw new CommerceProviderError('MerchantOrderNo is required for Nexora shipment create', {
        provider: 'nexora',
        operation: 'postShipment',
        externalCode: 'VALIDATION_ERROR',
      });
    }
    const tail = String(merchantOrderNo).includes('-') ? String(merchantOrderNo).split('-').pop() : merchantOrderNo;
    try {
      const byId = await nexoraRequest('GET', `/orders/${encodeURIComponent(tail)}`, {
        operation: 'postShipment.resolveOrder',
      });
      const order = byId.data ?? {};
      return String(order.orderId ?? order.id ?? tail);
    } catch {
      return String(tail);
    }
  }

  async postShipment(body) {
    const orderId = await this._resolveOrderIdForShipment(body);
    const nexoraBody = mapChannelEngineShipmentToNexora(orderId, body);
    const result = await nexoraRequest('POST', `/orders/${encodeURIComponent(orderId)}/shipments`, {
      operation: 'postShipment',
      body: nexoraBody,
    });

    const responseData = mapNexoraShipmentToChannelEngineShape(result.data ?? {});
    return buildPushLikeResponse({
      ok: true,
      status: result.status,
      data: responseData,
      rawText: result.rawText,
    });
  }

  async putShipmentDeliveryState(merchantShipmentNo, body) {
    const shipResult = await nexoraRequest('POST', `/shipments/${encodeURIComponent(merchantShipmentNo)}/ship`, {
      operation: 'putShipmentDeliveryState',
      body: {
        status: body.Status ?? body.status,
        deliveredAt: body.DeliveredAt ?? body.deliveredAt,
      },
    });
    return buildPushLikeResponse({
      ok: true,
      status: shipResult.status,
      data: mapNexoraShipmentToChannelEngineShape(shipResult.data ?? {}),
      rawText: shipResult.rawText,
    });
  }

  fetchMerchantShipmentsPage() {
    this._unsupported('fetchMerchantShipmentsPage');
  }

  fetchReturns() {
    this._unsupported('fetchReturns');
  }

  postReturnMerchant() {
    this._unsupported('postReturnMerchant');
  }

  postReturnMerchantAcknowledge() {
    this._unsupported('postReturnMerchantAcknowledge');
  }

  putReturnAcceptReject() {
    this._unsupported('putReturnAcceptReject');
  }

  fetchOrderInvoice() {
    this._unsupported('fetchOrderInvoice');
  }
}
