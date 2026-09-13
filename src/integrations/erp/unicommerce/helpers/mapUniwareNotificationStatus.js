/**
 * Maps UniCommerce Post Status Notification item status → StockConnect SKU status.
 * Inverse of mapItemStatus in mapOrderStatus.js where applicable.
 */
export const mapUniwareNotificationSkuStatus = (uniwareStatus, isReverse = false) => {
  const status = String(uniwareStatus || '').toUpperCase();

  if (isReverse) {
    switch (status) {
      case 'COMPLETE':
        return 'RETURNED';
      case 'COURIER_ALLOCATED':
        return 'RETURN_REQUESTED';
      case 'NOT_RECEIVED':
        return 'IN_PROGRESS';
      case 'CREATED':
        return 'RETURN_REQUESTED';
      default:
        return 'IN_PROGRESS';
    }
  }

  switch (status) {
    case 'DISPATCHED':
    case 'SHIPPED':
      return 'SHIPPED';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'RETURN_EXPECTED':
    case 'RETURN_ACKNOWLEDGED':
    case 'RETURNED':
      return 'RETURNED';
    case 'PACKED':
    case 'READY_TO_SHIP':
    case 'MANIFESTED':
      return 'SHIPMENT_CREATED';
    case 'LOCATION_NOT_SERVICEABLE':
      return 'REQUIRES_CORRECTION';
    case 'CREATED':
      return 'IN_PROGRESS';
    default:
      return 'IN_PROGRESS';
  }
};

/**
 * Derive order-level status from SKU statuses after notification processing.
 */
export const deriveOrderStatusFromSkus = (skuList = []) => {
  if (!skuList.length) return 'IN_PROGRESS';

  const statuses = skuList.map((s) => String(s.status || '').toUpperCase());

  if (statuses.every((s) => s === 'CANCELED' || s === 'CANCELLED')) return 'CANCELED';
  if (statuses.every((s) => s === 'DELIVERED')) return 'CLOSED';
  if (statuses.every((s) => s === 'SHIPPED' || s === 'DELIVERED')) return 'SHIPPED';
  if (statuses.some((s) => s === 'SHIPPED' || s === 'DELIVERED' || s === 'SHIPMENT_CREATED')) {
    return 'IN_PROGRESS';
  }
  if (statuses.every((s) => s === 'RETURNED')) return 'RETURNED';

  return 'IN_PROGRESS';
};

export const parseUniwareUpdatedAt = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Collapse repeated orderItemId rows (one per quantity) — keep latest `updated` per line.
 */
export const collapseNotificationOrderItems = (orderItems = []) => {
  const byLineId = new Map();

  for (const item of orderItems) {
    const orderItemId = String(item.orderItemId ?? '');
    if (!orderItemId) continue;

    const updatedAt = parseUniwareUpdatedAt(item.updated);
    const existing = byLineId.get(orderItemId);

    if (!existing || updatedAt >= existing.updatedAt) {
      byLineId.set(orderItemId, { ...item, orderItemId, updatedAt });
    }
  }

  return [...byLineId.values()];
};

export default {
  mapUniwareNotificationSkuStatus,
  deriveOrderStatusFromSkus,
  parseUniwareUpdatedAt,
  collapseNotificationOrderItems,
};
