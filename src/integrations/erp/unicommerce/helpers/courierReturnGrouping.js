export const buildCourierReturnId = ({ orderId, airWaybillNo }) => {
  const normalizedOrderId = String(orderId || '').trim();
  const awb = String(airWaybillNo || '').trim();

  if (!normalizedOrderId) return '';
  if (awb) return `RTO-${normalizedOrderId}-${awb}`;
  return `RTO-${normalizedOrderId}`;
};

export const buildCourierReturnGroupKey = ({ orderId, sellerId, airWaybillNo }) => {
  const awb = String(airWaybillNo || '').trim();
  return `${String(orderId || '').trim()}|${String(sellerId || '').trim()}|${awb}`;
};

export const groupPendingCourierReturns = (entries = []) => {
  const grouped = new Map();

  for (const entry of entries) {
    const key = buildCourierReturnGroupKey({
      orderId: entry.orderId,
      sellerId: entry.sellerId,
      airWaybillNo: entry.airWaybillNo,
    });

    if (!grouped.has(key)) {
      grouped.set(key, {
        orderId: entry.orderId,
        channelOrderNo: entry.channelOrderNo,
        sellerId: entry.sellerId,
        airWaybillNo: String(entry.airWaybillNo || '').trim(),
        lines: [],
      });
    }

    const group = grouped.get(key);
    const alreadyIncluded = group.lines.some((line) => line.orderLineId === entry.orderLineId);
    if (!alreadyIncluded) {
      group.lines.push({
        orderLineId: entry.orderLineId,
        merchantProductNo: entry.merchantProductNo,
        quantity: entry.quantity,
      });
    }
  }

  return Array.from(grouped.values());
};

export default {
  buildCourierReturnId,
  buildCourierReturnGroupKey,
  groupPendingCourierReturns,
};
