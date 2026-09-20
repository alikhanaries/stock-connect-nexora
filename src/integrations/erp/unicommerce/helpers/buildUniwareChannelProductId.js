import { buildProductIdBySku } from './buildProductIdBySku.js';

/**
 * Uniware Get Products exposes parent `id` (Mongo _id) and variant `variantId` (productSkuCode).
 * Post Return to UC expects channelProductId as `${productId}-${variantId}`.
 */
export const formatUniwareChannelProductId = (productIdBySku, variantSku) => {
  const sku = String(variantSku || '').trim();
  if (!sku) return null;

  const productId = productIdBySku.get(sku);
  if (!productId) return null;

  return `${String(productId)}-${sku}`;
};

export const buildUniwareChannelProductIdMap = async (sellerId, orders) => {
  const productIdBySku = await buildProductIdBySku(sellerId, orders);
  const channelProductIdBySku = new Map();

  for (const [variantSku] of productIdBySku) {
    const channelProductId = formatUniwareChannelProductId(productIdBySku, variantSku);
    if (channelProductId) {
      channelProductIdBySku.set(variantSku, channelProductId);
    }
  }

  return channelProductIdBySku;
};

export default {
  formatUniwareChannelProductId,
  buildUniwareChannelProductIdMap,
};
