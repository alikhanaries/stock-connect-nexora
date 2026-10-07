/**
 * Maps Nexora StockConnect integration payloads to ChannelEngine-shaped objects
 * expected by existing StockConnect business services.
 */

export function mapNexoraOrderLineToChannelEngineShape(line = {}) {
  const merchantProductNo = line.MerchantProductNo ?? line.merchantProductNo ?? line.merchantSku ?? line.sku ?? null;

  return {
    ...line,
    Id: line.Id ?? line.id ?? line.orderLineId ?? null,
    MerchantProductNo: merchantProductNo,
    Quantity: line.Quantity ?? line.quantity ?? null,
  };
}

function normalizeOrderLines(order = {}) {
  const raw = order.Lines ?? order.lines ?? order.orderLines ?? order.items ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(mapNexoraOrderLineToChannelEngineShape);
}

export function mapNexoraOrderToChannelEngineShape(order = {}) {
  const Lines = normalizeOrderLines(order);

  return {
    ...order,
    Id: order.id ?? order.orderId ?? order.Id ?? null,
    MerchantOrderNo:
      order.externalOrderReference ?? order.merchantOrderNo ?? order.MerchantOrderNo ?? order.orderNumber ?? null,
    ChannelOrderNo: order.orderNumber ?? order.channelOrderNumber ?? order.ChannelOrderNo ?? null,
    Status: order.status ?? order.integrationStatus ?? order.orderStatus ?? order.Status ?? null,
    CreatedAt: order.createdAt ?? order.created_at ?? order.CreatedAt ?? null,
    UpdatedAt: order.updatedAt ?? order.updated_at ?? order.UpdatedAt ?? null,
    Lines,
    ShippingAddress: order.shippingAddress ?? order.shipping_address ?? order.ShippingAddress ?? order.customer ?? null,
    Currency: order.currency ?? order.Currency,
    TotalMinor: order.totalMinor ?? order.TotalMinor,
    ChannelId: order.channelId ?? order.ChannelId,
  };
}

export function mapNexoraProductToChannelEngineShape(product = {}) {
  const sku = product.merchantSku ?? product.merchantProductNo ?? product.sku ?? product.productSkuCode;
  return {
    ...product,
    MerchantProductNo: sku ?? product.MerchantProductNo,
    Id: product.id ?? product.productId ?? product.Id,
    Status: product.status ?? product.Status,
    ExternalReference: product.externalReference ?? product.ExternalReference,
    inventorySummary: product.inventorySummary ?? product.InventorySummary,
  };
}

/** Nexora shipment create/ship responses → fields StockConnect shipment callers read. */
export function mapNexoraShipmentToChannelEngineShape(shipment = {}) {
  return {
    ...shipment,
    Id: shipment.id ?? shipment.shipmentId ?? shipment.Id,
    MerchantShipmentNo: shipment.merchantShipmentNo ?? shipment.id ?? shipment.shipmentId,
    Status: shipment.status ?? shipment.Status,
    TrackTraceNo: shipment.trackingNumber ?? shipment.tracking_number ?? shipment.TrackTraceNo,
  };
}
/** Nexora POST /products strict body (stock-connect.schemas.js). */
export function mapChannelEngineProductToNexoraCreate(ceProduct = {}) {
  const merchantSku = ceProduct.MerchantProductNo ?? ceProduct.ManufacturerProductNumber;
  if (!merchantSku) {
    throw new Error('MerchantProductNo is required to create a Nexora product');
  }
  const payload = {
    merchantSku: String(merchantSku),
  };
  const externalReference =
    ceProduct.externalReference ?? ceProduct.ExternalReference ?? (ceProduct.Ean ? String(ceProduct.Ean) : undefined);
  if (externalReference !== undefined) {
    payload.externalReference = externalReference;
  }
  if (ceProduct.productType) {
    payload.productType = ceProduct.productType;
  }
  return payload;
}

export function extractCeTargetStock(entry = {}) {
  if (entry.StockLocations?.[0]?.Stock !== undefined) {
    return Number(entry.StockLocations[0].Stock);
  }
  if (entry.Stock !== undefined) return Number(entry.Stock);
  if (entry.stock !== undefined) return Number(entry.stock);
  if (entry.quantity !== undefined) return Number(entry.quantity);
  return null;
}

export function mapChannelEngineShipmentToNexora(_orderId, cePayload = {}) {
  const lines = (cePayload.Lines || [])
    .filter((line) => line.orderLineId || line.OrderLineId)
    .map((line) => ({
      orderLineId: line.orderLineId ?? line.OrderLineId,
      quantity: line.quantity ?? line.Quantity ?? 1,
    }));

  return {
    lines,
    carrier: cePayload.Method ?? cePayload.carrier ?? null,
    trackingNumber: cePayload.TrackTraceNo ?? cePayload.AirWaybillNo ?? cePayload.trackingNumber ?? null,
  };
}

export function mapNexoraChannelsToChannelEngineContent(channels = []) {
  if (!Array.isArray(channels) || !channels.length) {
    return [];
  }

  const groups = new Map();
  for (const ch of channels) {
    const globalId = ch.marketplaceId ?? ch.globalChannelId ?? ch.platform ?? 'default';
    if (!groups.has(globalId)) {
      groups.set(globalId, {
        LanguageCode: ch.languageCode ?? 'en',
        CountryCode: ch.countryCode ?? ch.country ?? 'SA',
        GlobalChannelId: globalId,
        GlobalChannelName: ch.globalChannelName ?? ch.marketplaceName ?? ch.name ?? String(globalId),
        Channels: [],
      });
    }
    const isEnabled = ch.isEnabled ?? ch.enabled;
    const statusEnabled = typeof ch.status === 'string' ? ch.status.toUpperCase() === 'ACTIVE' : undefined;
    groups.get(globalId).Channels.push({
      ChannelId: ch.channelId ?? ch.id,
      IsEnabled: isEnabled ?? statusEnabled ?? true,
      ChannelName: ch.channelName ?? ch.name,
      Reference: ch.reference ?? ch.externalReference ?? ch.code ?? null,
    });
  }
  return [...groups.values()];
}

export function buildCePagedOrdersBody(items, { totalCount, page, pageSize, hasMore }) {
  const content = items.map(mapNexoraOrderToChannelEngineShape);
  let resolvedTotal = totalCount;
  if (resolvedTotal == null) {
    resolvedTotal = hasMore ? page * pageSize + 1 : (page - 1) * pageSize + content.length;
  }
  return {
    Content: content,
    TotalCount: resolvedTotal,
    ItemsPerPage: pageSize,
  };
}

export function buildCeCancellationPushData(nexoraBody, httpStatus = 200) {
  return {
    StatusCode: httpStatus,
    Message: nexoraBody?.message ?? 'OK',
    ...nexoraBody,
  };
}
