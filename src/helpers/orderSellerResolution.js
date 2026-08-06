import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import { getExistingProductsBySkuFromCE, chunkArray } from '../service/channel/ceService.js';

export const normalizeOrderSku = (sku) => (sku ? String(sku).trim().toLowerCase() : '');

/**
 * Extract sellerId from CE ExtraData (order line or CE product catalog).
 * Accepts CE API shape ({ Key, Value }) and stored shape ({ key, value }).
 */
export const getExtraSellerId = (extraData = []) => {
  if (!Array.isArray(extraData) || !extraData.length) return null;

  const hit = extraData.find((e) => String(e?.Key ?? e?.key ?? '').toLowerCase() === 'sellerid');
  const value = hit?.Value ?? hit?.value;
  if (!value) return null;

  const str = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(str)) return null;

  return new mongoose.Types.ObjectId(str);
};

/**
 * Build SKU → sellerId map from ChannelEngine product catalog ExtraData.
 */
export const buildCeProductSellerMap = (ceProducts = []) => {
  const map = new Map();
  for (const product of ceProducts) {
    const sku = normalizeOrderSku(product?.MerchantProductNo);
    if (!sku) continue;
    const sellerId = getExtraSellerId(product?.ExtraData);
    if (sellerId) map.set(sku, sellerId);
  }
  return map;
};

/**
 * Batch-fetch CE products for unresolved SKUs (chunked, one round-trip per chunk).
 */
export const fetchCeProductSellerMapForSkus = async (skuList = []) => {
  const normalized = [...new Set(skuList.map(normalizeOrderSku).filter(Boolean))];
  if (!normalized.length) return new Map();

  const ceProducts = [];
  for (const chunk of chunkArray(normalized, 50)) {
    const batch = await getExistingProductsBySkuFromCE(chunk);
    ceProducts.push(...batch);
  }

  return buildCeProductSellerMap(ceProducts);
};

/**
 * Resolve sellerId for a single CE order line.
 *
 * Resolution order (first match wins):
 * 1. Product.productSkuCode mapping
 * 2. existingSku.sellerId (previously stored on this line)
 * 3. Order line ExtraData.sellerId
 * 4. ChannelEngine Product ExtraData.sellerId
 * 5. order-level finalSellerId (last resort)
 */
export const resolveOrderLineSellerId = ({
  merchantProductNo,
  productSellerMap,
  existingSku,
  extraData,
  ceProductSellerMap,
  finalSellerId = null,
  sellerExistsCache = null,
}) => {
  const normalizedSku = normalizeOrderSku(merchantProductNo);
  const sellerIdFromMap = (normalizedSku && productSellerMap?.get(normalizedSku)) || null;
  const sellerIdFromExisting = existingSku?.sellerId || null;
  const sellerIdFromOrderExtra = getExtraSellerId(extraData);
  const sellerIdFromCeProduct = (normalizedSku && ceProductSellerMap?.get(normalizedSku)) || null;
  const sellerIdFromFinal = finalSellerId || null;

  const audit = {
    sellerIdFromMap,
    sellerIdFromExisting,
    sellerIdFromOrderExtra,
    sellerIdFromCeProduct,
    sellerIdFromFinal,
  };

  const isUsableSeller = (id) => {
    if (!id) return false;
    if (!sellerExistsCache) return true;
    return sellerExistsCache.has(String(id));
  };

  const candidates = [
    { sellerId: sellerIdFromMap, source: 'productMap' },
    { sellerId: sellerIdFromExisting, source: 'existingSku' },
    { sellerId: sellerIdFromOrderExtra, source: 'orderExtraData' },
    { sellerId: sellerIdFromCeProduct, source: 'ceProductExtraData' },
    { sellerId: sellerIdFromFinal, source: 'finalSellerId' },
  ];

  for (const candidate of candidates) {
    if (isUsableSeller(candidate.sellerId)) {
      return {
        sellerId: candidate.sellerId,
        source: candidate.source,
        ...audit,
      };
    }
  }

  return {
    sellerId: null,
    source: null,
    ...audit,
  };
};

/**
 * Preload seller existence for all candidate sellerIds in a sync batch.
 */
export const buildSellerExistenceCache = async ({
  productSellerMap,
  ceProductSellerMap,
  existingOrders = [],
  extraSellerIds = [],
}) => {
  const ids = new Set();

  productSellerMap?.forEach((sellerId) => {
    if (sellerId) ids.add(String(sellerId));
  });
  ceProductSellerMap?.forEach((sellerId) => {
    if (sellerId) ids.add(String(sellerId));
  });
  for (const id of extraSellerIds) {
    if (id) ids.add(String(id));
  }
  for (const order of existingOrders) {
    for (const sku of order.orderSkuList?.skuList || []) {
      if (sku?.sellerId) ids.add(String(sku.sellerId));
    }
    if (order.sellerId) ids.add(String(order.sellerId));
    for (const sid of order.sellerIds || []) {
      if (sid) ids.add(String(sid));
    }
  }

  const validIds = [...ids].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validIds.length) return new Set();

  const sellers = await Seller.find({
    _id: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('_id')
    .lean();

  return new Set(sellers.map((s) => String(s._id)));
};

/**
 * Validate a resolved sellerId before persisting sellerorders.
 */
export const validateResolvedSellerId = (sellerId, sellerExistsCache) => {
  if (!sellerId) {
    return { valid: false, reason: 'No CE Product Seller' };
  }

  const str = String(sellerId);
  if (!mongoose.Types.ObjectId.isValid(str)) {
    return { valid: false, reason: 'Invalid Seller' };
  }

  if (!sellerExistsCache.has(str)) {
    return { valid: false, reason: 'Missing Seller' };
  }

  return { valid: true, reason: null };
};

/**
 * Log detailed seller resolution failure (never silent skip).
 */
export const logUnresolvedSellerLine = ({ orderId, merchantProductNo, resolution, validationReason, tag }) => {
  const audit = {
    orderId,
    sku: merchantProductNo,
    productLookup: resolution?.sellerIdFromMap ? String(resolution.sellerIdFromMap) : null,
    existingSku: resolution?.sellerIdFromExisting ? String(resolution.sellerIdFromExisting) : null,
    orderExtraData: resolution?.sellerIdFromOrderExtra ? String(resolution.sellerIdFromOrderExtra) : null,
    ceProductCatalog: resolution?.sellerIdFromCeProduct ? String(resolution.sellerIdFromCeProduct) : null,
    finalSellerId: resolution?.sellerIdFromFinal ? String(resolution.sellerIdFromFinal) : null,
    reason: validationReason || 'No CE Product Seller',
  };

  console.warn(`${tag || '[sanitizeOrdersData]'}.e UNRESOLVED seller for order line ${JSON.stringify(audit)}`);
};

/**
 * Resolve sellerIds for all lines in a stored order (backfill path).
 * Uses the same resolution chain as sanitizeOrdersData().
 */
export const resolveSellerIdsForStoredSkus = async ({ skuList = [], productSellerMap }) => {
  const unresolvedSkus = skuList
    .filter((sku) => {
      const normalized = normalizeOrderSku(sku.merchantProductNo);
      return !sku.sellerId && normalized && !productSellerMap?.get(normalized);
    })
    .map((sku) => sku.merchantProductNo);

  const ceProductSellerMap = await fetchCeProductSellerMapForSkus(unresolvedSkus);

  const extraSellerIds = skuList.flatMap((sku) => {
    const id = getExtraSellerId(sku.extraData);
    return id ? [String(id)] : [];
  });

  const sellerExistsCache = await buildSellerExistenceCache({
    productSellerMap,
    ceProductSellerMap,
    extraSellerIds,
  });

  const sellerIdSet = new Set();
  let changed = false;

  for (const sku of skuList) {
    if (sku.sellerId && sellerExistsCache.has(String(sku.sellerId))) {
      sellerIdSet.add(String(sku.sellerId));
      continue;
    }

    const resolved = resolveOrderLineSellerId({
      merchantProductNo: sku.merchantProductNo,
      productSellerMap,
      existingSku: sku,
      extraData: sku.extraData,
      ceProductSellerMap,
      sellerExistsCache,
    });

    if (resolved.sellerId) {
      sku.sellerId = resolved.sellerId;
      changed = true;
      sellerIdSet.add(String(resolved.sellerId));
    }
  }

  return { sellerIdSet, changed, ceProductSellerMap };
};
