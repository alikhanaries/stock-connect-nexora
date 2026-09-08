import { uniCommerceConfig } from '../config/config.js';
import { buildProductIdBySku } from '../helpers/buildProductIdBySku.js';
import { postToUniwareProxy } from '../utils/unicommerceProxyClient.js';

// Same identifier Uniware receives as order `code` from mapOrderToUniware.
export const resolveUniwareSaleOrderCode = (order) => order.channelOrderNumber || String(order.orderId);

export const isUniwareCancelConfigured = () => {
  const { GENERIC_PROXY_URL, CLIENT_ID, MERCHANT_ID, SECURITY_KEY } = uniCommerceConfig;
  return Boolean(GENERIC_PROXY_URL && CLIENT_ID && MERCHANT_ID && SECURITY_KEY);
};

export const buildUniwareCancelPayload = async (order, cancelledItems, cancellationReason, sellerId) => {
  const productIdBySku = await buildProductIdBySku(sellerId, [order]);

  const cancelledSkuCodes = cancelledItems
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => {
      const variantId = item.variantId || item.merchantProductNo || '';
      const productId = String(productIdBySku.get(variantId) || item.channelProductNo || '');

      return {
        quantity: Number(item.quantity),
        productId,
        variantId,
      };
    })
    .filter((item) => item.productId && item.variantId);

  return {
    saleOrderCode: resolveUniwareSaleOrderCode(order),
    cancelledSkuCodes,
    cancellationReason: cancellationReason || 'NA',
  };
};

export const postOrderCancelToUniware = async ({ order, cancelledItems, cancellationReason, sellerId }) => {
  if (order?.channelName === 'OCP') {
    return { skipped: true, reason: 'ocp_order' };
  }

  if (!isUniwareCancelConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const merchantId = uniCommerceConfig.MERCHANT_ID;
  const payload = await buildUniwareCancelPayload(order, cancelledItems, cancellationReason, sellerId);

  if (!payload.saleOrderCode) {
    console.warn('Uniware cancel skipped: saleOrderCode missing', { orderId: order?._id });
    return { skipped: true, reason: 'missing_sale_order_code' };
  }

  if (!payload.cancelledSkuCodes.length) {
    console.warn('Uniware cancel skipped: no mappable cancelled SKUs', {
      saleOrderCode: payload.saleOrderCode,
      sellerId,
    });
    return { skipped: true, reason: 'unmapped_items' };
  }

  const result = await postToUniwareProxy(uniCommerceConfig.CANCEL_ENDPOINT, payload, { merchantId });

  if (!result.ok || result.data?.status !== 'success') {
    console.error('Uniware order cancel failed:', {
      httpStatus: result.status,
      saleOrderCode: payload.saleOrderCode,
      responseStatus: result.data?.status,
      message: result.data?.message,
    });
    return { success: false, status: result.status, data: result.data };
  }

  return { success: true, data: result.data };
};

export const notifyUniwareOrderCancel = async (params) => {
  try {
    return await postOrderCancelToUniware(params);
  } catch (error) {
    console.error('Uniware order cancel error:', error.message);
    return { success: false, error: error.message };
  }
};

export default {
  resolveUniwareSaleOrderCode,
  isUniwareCancelConfigured,
  buildUniwareCancelPayload,
  postOrderCancelToUniware,
  notifyUniwareOrderCancel,
};
