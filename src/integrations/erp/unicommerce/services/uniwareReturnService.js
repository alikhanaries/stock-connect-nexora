import { config } from '#config/config.js';
import Order from '#root/src/models/Orders.js';
import Return from '#root/src/models/Return.js';
import { uniCommerceConfig } from '../config/config.js';
import { buildCourierReturnId, groupPendingCourierReturns } from '../helpers/courierReturnGrouping.js';
import { formatUniwareChannelProductId } from '../helpers/buildUniwareChannelProductId.js';
import { buildProductIdBySku } from '../helpers/buildProductIdBySku.js';
import { resolveUniwareSaleOrderCode, isUniwareCancelConfigured } from './uniwareCancelService.js';
import { postToUniwareProxy } from '../utils/unicommerceProxyClient.js';

const { STOCK_LOCATION } = config;

export const isUniwareReturnConfigured = isUniwareCancelConfigured;

export const formatUniwareReturnCreatedOn = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatUniwareReturnCreatedOn(new Date());
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const resolveVariantSku = (item) => item?.productSkuCode || item?.merchantProductNo || item?.variantId || '';

export {
  buildCourierReturnId,
  buildCourierReturnGroupKey,
  groupPendingCourierReturns,
} from '../helpers/courierReturnGrouping.js';

const groupReturnProductsBySeller = (products = []) => {
  const grouped = new Map();

  for (const product of products) {
    const sellerId = String(product?.sellerId || '');
    if (!sellerId) continue;

    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, []);
    }
    grouped.get(sellerId).push(product);
  }

  return grouped;
};

export const buildUniwareReturnPayload = async ({
  order,
  type,
  returnDocument,
  orderItems = [],
  sellerId,
  returnId,
  reason,
  createdOn,
}) => {
  const productIdBySku = await buildProductIdBySku(sellerId, [order]);

  const mappedOrderItems = orderItems
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => {
      const variantSku = resolveVariantSku(item);
      const channelProductId = formatUniwareChannelProductId(productIdBySku, variantSku);

      return {
        channelProductId,
        quantity: Number(item.quantity),
      };
    })
    .filter((item) => item.channelProductId);

  return {
    saleOrderCode: resolveUniwareSaleOrderCode(order),
    reason:
      reason || returnDocument?.reason || (type === 'COURIER_RETURN' ? 'Courier return (RTO)' : 'Customer return'),
    trackingNumber: '',
    returnID: String(returnId || returnDocument?.returnId || ''),
    returnWarehouseCode: STOCK_LOCATION || null,
    shippingProviderCode: 'CHANNEL_SHIPPING',
    type,
    status: 'CREATED',
    IsReverse: true,
    orderItems: mappedOrderItems,
    createdOn: formatUniwareReturnCreatedOn(createdOn || returnDocument?.placedOn || new Date()),
  };
};

export const findOrderForReturnDocument = async (returnDocument) => {
  if (!returnDocument) return null;

  const filters = [];

  if (returnDocument.orderId) {
    filters.push({ orderId: String(returnDocument.orderId) });
  }
  if (returnDocument.merchantOrderNo) {
    filters.push({ merchantOrderNo: String(returnDocument.merchantOrderNo) });
  }
  if (returnDocument.channelOrderNo) {
    filters.push({ channelOrderNumber: String(returnDocument.channelOrderNo) });
  }

  if (!filters.length) return null;

  return Order.findOne({ $or: filters }).lean();
};

export const hasCustomerReturnForOrderLine = async (orderId, orderLineId) => {
  if (!orderId || orderLineId == null) return false;

  const exists = await Return.exists({
    orderId: String(orderId),
    'products.orderLineId': Number(orderLineId),
  });

  return Boolean(exists);
};

export const postReturnToUniware = async ({
  order,
  type,
  returnDocument = null,
  orderItems = [],
  sellerId,
  returnId,
  reason,
  createdOn,
}) => {
  if (order?.channelName === 'OCP') {
    return { skipped: true, reason: 'ocp_order' };
  }

  if (!isUniwareReturnConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const merchantId = uniCommerceConfig.MERCHANT_ID;
  const payload = await buildUniwareReturnPayload({
    order,
    type,
    returnDocument,
    orderItems,
    sellerId,
    returnId,
    reason,
    createdOn,
  });

  if (!payload.saleOrderCode) {
    console.warn('Uniware return skipped: saleOrderCode missing', { orderId: order?._id, type });
    return { skipped: true, reason: 'missing_sale_order_code' };
  }

  if (!payload.returnID) {
    console.warn('Uniware return skipped: returnID missing', { saleOrderCode: payload.saleOrderCode, type });
    return { skipped: true, reason: 'missing_return_id' };
  }

  if (!payload.orderItems.length) {
    console.warn('Uniware return skipped: no mappable channelProductId items', {
      saleOrderCode: payload.saleOrderCode,
      type,
      sellerId,
    });
    return { skipped: true, reason: 'unmapped_items' };
  }

  const result = await postToUniwareProxy(uniCommerceConfig.RETURNS_ENDPOINT, payload, { merchantId });

  if (!result.ok || result.data?.status !== 'success') {
    console.error('Uniware return notify failed:', {
      httpStatus: result.status,
      saleOrderCode: payload.saleOrderCode,
      returnID: payload.returnID,
      type: payload.type,
      responseStatus: result.data?.status,
      message: result.data?.message,
    });
    return { success: false, status: result.status, data: result.data };
  }

  return { success: true, data: result.data };
};

export const notifyUniwareReturn = async ({ returnDocument }) => {
  try {
    if (!returnDocument?.returnId) {
      return { skipped: true, reason: 'missing_return_document' };
    }

    const order = await findOrderForReturnDocument(returnDocument);
    if (!order) {
      console.warn('Uniware return skipped: order not found for return', {
        returnId: returnDocument.returnId,
        orderId: returnDocument.orderId,
      });
      return { skipped: true, reason: 'order_not_found' };
    }

    const productsBySeller = groupReturnProductsBySeller(returnDocument.products || []);
    if (!productsBySeller.size) {
      return { skipped: true, reason: 'no_return_products' };
    }

    const results = [];
    for (const [sellerId, products] of productsBySeller) {
      const result = await postReturnToUniware({
        order,
        type: 'CUSTOMER_RETURN',
        returnDocument,
        orderItems: products,
        sellerId,
      });
      results.push(result);
    }

    return { success: true, results };
  } catch (error) {
    console.error('Uniware return notify error:', error.message);
    return { success: false, error: error.message };
  }
};

export const notifyUniwareCourierReturns = async (pendingCourierReturns = []) => {
  try {
    if (!pendingCourierReturns.length) {
      return { skipped: true, reason: 'no_pending_courier_returns' };
    }

    const groups = groupPendingCourierReturns(pendingCourierReturns);
    const results = [];

    for (const group of groups) {
      const normalizedOrderId = String(group.orderId || '');
      if (!normalizedOrderId || !group.sellerId) {
        results.push({ skipped: true, reason: 'missing_courier_return_context' });
        continue;
      }

      const eligibleLines = [];
      for (const line of group.lines) {
        if (line.orderLineId == null) continue;

        if (await hasCustomerReturnForOrderLine(normalizedOrderId, line.orderLineId)) {
          continue;
        }

        eligibleLines.push(line);
      }

      if (!eligibleLines.length) {
        results.push({ skipped: true, reason: 'customer_return_exists' });
        continue;
      }

      const order = await Order.findOne({
        $or: [
          { orderId: normalizedOrderId },
          ...(group.channelOrderNo ? [{ channelOrderNumber: group.channelOrderNo }] : []),
        ],
      }).lean();

      if (!order) {
        console.warn('Uniware courier return skipped: order not found', {
          orderId: normalizedOrderId,
          airWaybillNo: group.airWaybillNo,
        });
        results.push({ skipped: true, reason: 'order_not_found' });
        continue;
      }

      if (order.channelName === 'OCP') {
        results.push({ skipped: true, reason: 'ocp_order' });
        continue;
      }

      const returnId = buildCourierReturnId({
        orderId: normalizedOrderId,
        airWaybillNo: group.airWaybillNo,
      });

      const result = await postReturnToUniware({
        order,
        type: 'COURIER_RETURN',
        orderItems: eligibleLines.map((line) => ({
          productSkuCode: line.merchantProductNo,
          merchantProductNo: line.merchantProductNo,
          orderLineId: line.orderLineId,
          quantity: line.quantity || 1,
        })),
        sellerId: group.sellerId,
        returnId,
        reason: 'Courier return (RTO)',
      });
      results.push(result);
    }

    return { success: true, results };
  } catch (error) {
    console.error('Uniware courier return notify error:', error.message);
    return { success: false, error: error.message };
  }
};

export default {
  isUniwareReturnConfigured,
  formatUniwareReturnCreatedOn,
  buildUniwareReturnPayload,
  findOrderForReturnDocument,
  hasCustomerReturnForOrderLine,
  postReturnToUniware,
  notifyUniwareReturn,
  notifyUniwareCourierReturns,
};
