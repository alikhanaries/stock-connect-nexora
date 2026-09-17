import Order from '#models/Orders.js';
import Product from '../models/Product.js';
import { formatValueForCSV } from './export.js';
import { formatDateTime } from './Common.js';
import { pushEntegraOrders } from '../integrations/erp/entegra/service/orderService.js';
import { ENTEGRA_BRAND_MAP } from '../integrations/erp/entegra/constants/common.js';
import { pushSentosOrders } from '../integrations/erp/sentos/services/orderService.js';
import { isSentosConfigured, sentosConfig } from '../integrations/erp/sentos/config/config.js';
import { pushRespireOrders } from '../integrations/erp/respire/service/orderService.js';
import { isRespireConfigured, respireConfig } from '../integrations/erp/respire/config/config.js';
import Seller from '#models/Seller.js';
import {
  resolveStoredSkuStatus,
  deriveSellerOrderStatusFromSkus,
  orderHasLocalShipmentFulfillment,
} from '#root/src/service/sellerOrderService.js';
import {
  fetchCeProductSellerMapForSkus,
  resolveOrderLineSellerId,
  getExtraSellerId,
  normalizeOrderSku,
  buildSellerExistenceCache,
  validateResolvedSellerId,
  logUnresolvedSellerLine,
} from './orderSellerResolution.js';

export { getExtraSellerId, resolveOrderLineSellerId, normalizeOrderSku } from './orderSellerResolution.js';

const findExistingSku = (existingOrder, line) => {
  const skuList = existingOrder?.orderSkuList?.skuList || [];

  return (
    skuList.find((sku) => String(sku.id) === String(line.Id)) ??
    skuList.find((sku) => normalizeOrderSku(sku.merchantProductNo) === normalizeOrderSku(line.MerchantProductNo))
  );
};

const resolveSanitizedOrderStatus = (existingOrder, skuList) => {
  const preservedStatuses = ['SHIPPED', 'CLOSED', 'RETURNED', 'CANCELED'];

  if (preservedStatuses.includes(existingOrder?.status)) {
    return existingOrder.status;
  }

  const derivedStatus = deriveSellerOrderStatusFromSkus(skuList);

  if (derivedStatus === 'NEW' && orderHasLocalShipmentFulfillment(existingOrder)) {
    return 'IN_PROGRESS';
  }

  return derivedStatus;
};

const getPeriodDate = (lowercasedPeriod) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentPeriodStart, previousPeriodStart, previousPeriodEnd;

  if (lowercasedPeriod === 'year') {
    const year = today.getFullYear();

    currentPeriodStart = new Date(year, 0, 1);

    previousPeriodStart = new Date(year - 1, 0, 1);
    previousPeriodEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);
  } else if (lowercasedPeriod === 'month') {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    currentPeriodStart = new Date(currentYear, currentMonth, 1);

    previousPeriodStart = new Date(currentYear, currentMonth - 1, 1);
    previousPeriodEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  } else if (lowercasedPeriod === 'week') {
    const dayOfWeek = today.getDay();
    const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

    currentPeriodStart = new Date(today);
    currentPeriodStart.setDate(diffToMonday);
    currentPeriodStart.setHours(0, 0, 0, 0);

    previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);

    previousPeriodEnd = new Date(currentPeriodStart);
    previousPeriodEnd.setMilliseconds(-1);
  } else {
    throw new Error(`Unsupported period: ${lowercasedPeriod}`);
  }

  return { currentPeriodStart, previousPeriodStart, previousPeriodEnd };
};

// Auto-flatten aggregated order
export const flattenAggregatedOrder = (order = {}) => {
  // clone shallow to preserve top-level fields initially
  const flattened = { ...order };

  // DON'T add 'orderId' here; we want top-level preserved
  const excludeKeys = ['_id', '__v'];

  const safeGet = (o, k) => (o && typeof o === 'object' && k in o ? o[k] : undefined);

  // helper: try to format date/time using existing helper if present
  const tryFormatDate = (v) => {
    try {
      if (!v) return null;
      const isDateObj = v instanceof Date;
      if (isDateObj) {
        if (typeof formatDateTime === 'function') {
          const formatted = formatDateTime(v);
          return formatted ? `${formatted.date} ${formatted.time}` : v.toISOString().slice(0, 19).replace('T', ' ');
        }
        return v.toISOString().slice(0, 19).replace('T', ' ');
      }
      if (typeof v === 'string' && !isNaN(Date.parse(v))) {
        const d = new Date(v);
        if (typeof formatDateTime === 'function') {
          const formatted = formatDateTime(d);
          return formatted ? `${formatted.date} ${formatted.time}` : d.toISOString().slice(0, 19).replace('T', ' ');
        }
        return d.toISOString().slice(0, 19).replace('T', ' ');
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  // Generic flattener for nested objects, with ability to skip specific nested keys
  const flattenObject = (parentKey, obj, skipFields = []) => {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach((k) => {
      if (excludeKeys.includes(k) || skipFields.includes(k)) return;
      const val = obj[k];
      if (val && typeof val === 'object' && !(val instanceof Date)) {
        const entries = Object.entries(val)
          .filter(([kk, vv]) => kk !== '_id' && kk !== '__v' && vv != null)
          .map(([kk, vv]) => `${kk}:${vv}`);
        flattened[`${parentKey}_${k}`] = entries.length ? entries.join(';') : 'N/A';
      } else {
        flattened[`${parentKey}_${k}`] = val != null ? val : 'N/A';
      }
    });
  };

  // Flatten nested objects; skip nested orderId only inside these nested objects
  flattenObject('orderCustomer', safeGet(order, 'orderCustomer'), ['orderId']);
  flattenObject('orderPaymentDetails', safeGet(order, 'orderPaymentDetails'), ['orderId']);
  flattenObject('orderShippingAddress', safeGet(order, 'orderShippingAddress'));
  flattenObject('orderBillingAddress', safeGet(order, 'orderBillingAddress'));

  // SKU handling
  const skuList =
    safeGet(order, 'orderSkuList') && Array.isArray(order.orderSkuList.skuList) ? order.orderSkuList.skuList : [];

  if (!Array.isArray(skuList) || skuList.length === 0) {
    flattened['orderSkuListCount'] = 0;
    // ensure commonly expected sku columns exist so headers align
    [
      'id',
      'merchantProductNo',
      'description',
      'quantity',
      'status',
      'unitPriceInclVat',
      'lineTotalInclVat',
      'gtin',
      'channelProductNo',
      'airWaybillNo',
      'condition',
      'vatRate',
      'unitVat',
      'lineVat',
      'expectedDeliveryDate',
      'expectedShipmentDate',
    ].forEach((k) => {
      const key = `sku${k.charAt(0).toUpperCase()}${k.slice(1)}`;
      flattened[key] = 'N/A';
    });
  } else {
    flattened['orderSkuListCount'] = skuList.length;

    // union of sku keys
    const allSkuKeys = new Set();
    skuList.forEach((sku) => {
      if (sku && typeof sku === 'object') Object.keys(sku).forEach((k) => allSkuKeys.add(k));
    });

    allSkuKeys.forEach((key) => {
      const values = skuList.map((sku) => {
        if (!sku || sku[key] === undefined || sku[key] === null || sku[key] === '') return 'N/A';
        const raw = sku[key];

        // date-like fields
        if (typeof key === 'string' && (key.toLowerCase().includes('date') || key.toLowerCase().includes('at'))) {
          const fd = tryFormatDate(raw);
          if (fd) return fd;
        }

        if (typeof raw === 'object' && !(raw instanceof Date)) {
          return (
            Object.entries(raw)
              .filter(([kk, vv]) => kk !== '_id' && kk !== '__v' && vv != null)
              .map(([kk, vv]) => `${kk}:${vv}`)
              .join(';') || 'N/A'
          );
        }
        return String(raw);
      });

      flattened[`skuList_${key}_list`] = values.length ? values.join(' | ') : 'N/A';
    });

    // ensure expected columns exist if some SKUs lacked them
    [
      'id',
      'merchantProductNo',
      'description',
      'quantity',
      'status',
      'unitPriceInclVat',
      'lineTotalInclVat',
      'gtin',
      'channelProductNo',
      'airWaybillNo',
      'condition',
      'vatRate',
      'unitVat',
      'lineVat',
      'expectedDeliveryDate',
      'expectedShipmentDate',
    ].forEach((k) => {
      const col = `skuList_${k}_list`;
      if (!(col in flattened)) flattened[col] = 'N/A';
    });
  }

  // keep createdAt/updatedAt if present
  if (order.createdAt) flattened.createdAt = order.createdAt;
  if (order.updatedAt) flattened.updatedAt = order.updatedAt;

  // Ensure 'orderId' is present
  const resolveOrderId = () => {
    // prefer explicit top-level fields
    if (safeGet(order, 'orderId')) return safeGet(order, 'orderId');
    if (safeGet(order, 'id')) return safeGet(order, 'id');
    if (order._id) return String(order._id);
    if (safeGet(order, 'orderNumber')) return safeGet(order, 'orderNumber');
    // check common nested places
    if (order.orderCustomer) {
      if (safeGet(order.orderCustomer, 'orderId')) return safeGet(order.orderCustomer, 'orderId');
      if (safeGet(order.orderCustomer, 'id')) return safeGet(order.orderCustomer, 'id');
    }
    return 'N/A';
  };

  const resolvedId = resolveOrderId();
  flattened.orderId = flattened.orderId || resolvedId;

  return flattened;
};

// Helper function to get headers for aggregated fields in specific order
export const getAggregatedOrderHeaders = (sampleOrder) => {
  // Order customer headers
  const customerHeaders = [];
  if (sampleOrder.orderCustomer) {
    Object.keys(sampleOrder.orderCustomer).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        customerHeaders.push(`orderCustomer_${key}`);
      }
    });
  }

  // Order payment details headers
  const paymentHeaders = [];
  if (sampleOrder.orderPaymentDetails) {
    Object.keys(sampleOrder.orderPaymentDetails).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'orderId') {
        paymentHeaders.push(`orderPaymentDetails_${key}`);
      }
    });
  }

  // Shipping address headers
  const shippingHeaders = [];
  if (sampleOrder.orderShippingAddress) {
    Object.keys(sampleOrder.orderShippingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        shippingHeaders.push(`orderShippingAddress_${key}`);
      }
    });
  }

  // Billing address headers
  const billingHeaders = [];
  if (sampleOrder.orderBillingAddress) {
    Object.keys(sampleOrder.orderBillingAddress).forEach((key) => {
      if (key !== '_id' && key !== '__v') {
        billingHeaders.push(`orderBillingAddress_${key}`);
      }
    });
  }

  // SKU list headers
  const skuHeaders = [
    'orderSkuListCount',
    'skuId',
    'skuMerchantProductNo',
    'skuDescription',
    'skuQuantity',
    'skuStatus',
    'skuUnitPriceInclVat',
    'skuLineTotalInclVat',
    'skuGtin',
    'skuChannelProductNo',
    'skuAirWaybillNo',
    'skuCondition',
    'skuVatRate',
    'skuUnitVat',
    'skuLineVat',
    'skuExpectedDeliveryDate',
    'skuExpectedShipmentDate',
  ];

  return {
    customerHeaders,
    paymentHeaders,
    shippingHeaders,
    billingHeaders,
    skuHeaders,
  };
};

// Helper function to get row data for organized headers
export const getOrganizedOrderRowData = (flattenedOrder, organizedHeaders) => {
  return organizedHeaders.map((header) => {
    const value = flattenedOrder[header];
    return formatValueForCSV(value, header);
  });
};

export const normalizeSkuStatus = (skuStatus) => {
  switch (skuStatus) {
    case 'NEW':
      return 'NEW';

    case 'IN_PROGRESS':
    case 'IN_COMBI':
    case 'SHIPMENT_CREATED':
      return 'IN_PROGRESS';

    case 'PICKED':
    case 'SHIPPED':
      return 'SHIPPED';

    case 'DELIVERED':
    case 'CLOSED':
      return 'DELIVERED';

    case 'CANCELED':
    case 'PARTIALLY_CANCELED':
    case 'MANCO':
      return 'CANCELED';

    case 'RETURNED':
      return 'RETURNED';

    default:
      return 'IN_PROGRESS';
  }
};

export const normalizeOrderStatus = (channelStatus) => {
  switch (channelStatus) {
    case 'NEW':
      return 'NEW';

    case 'IN_PROGRESS':
    case 'IN_COMBI':
    case 'SHIPMENT_CREATED':
      return 'IN_PROGRESS';

    case 'PICKED':
    case 'SHIPPED':
      return 'SHIPPED';

    case 'DELIVERED':
    case 'CLOSED':
      return 'CLOSED';

    case 'CANCELED':
    case 'PARTIALLY_CANCELED':
    case 'MANCO':
      return 'CANCELED';
    case 'RETURNED':
      return 'RETURNED';

    default:
      return 'IN_PROGRESS';
  }
};

export const buildStatuses = ({ line, existingSku }) => {
  //  DB is source of truth once SKU exists
  if (existingSku?.statuses?.length) {
    return existingSku.statuses;
  }

  const normalizedStatus = normalizeSkuStatus(line.Status);

  const qty = line.Quantity || 0;

  if (qty <= 0) return [];

  return [
    {
      status: normalizedStatus,
      quantity: qty,
    },
  ];
};

export const sanitizeOrdersData = async (orders, _sellerId, parentTag) => {
  const tag = parentTag ? `${parentTag} STEP 3.1` : '[order-sync][sanitizeOrdersData]';
  try {
    const orderIds = [];
    const skuSet = new Set();

    // Step 1: collect IDs & SKUs
    orders.forEach((order) => {
      if (order.Id) orderIds.push(order.Id);

      if (Array.isArray(order.Lines)) {
        order.Lines.forEach((line) => {
          const sku = normalizeOrderSku(line.MerchantProductNo);
          if (sku) skuSet.add(sku);
        });
      }
    });

    // Step 2: fetch existing data
    let existingOrdersDb, productsDb;
    try {
      [existingOrdersDb, productsDb] = await Promise.all([
        Order.find({ orderId: { $in: orderIds } }).lean(),
        Product.find({ productSkuCode: { $in: Array.from(skuSet) } })
          .select('productSkuCode sellerId brand')
          .collation({ locale: 'en', strength: 2 })
          .lean(),
      ]);
    } catch (err) {
      console.error(`${tag}.b FAILED fetching existing orders/products:`, err);
      throw err;
    }

    const existingOrdersMap = new Map(existingOrdersDb.map((o) => [o.orderId, o]));
    const productSellerMap = new Map(productsDb.map((p) => [normalizeOrderSku(p.productSkuCode), p.sellerId]));

    const unresolvedSkus = [...skuSet].filter((sku) => !productSellerMap.has(sku));
    let ceProductSellerMap;
    try {
      ceProductSellerMap = await fetchCeProductSellerMapForSkus(unresolvedSkus);
    } catch (err) {
      console.error(`${tag}.c FAILED fetchCeProductSellerMapForSkus:`, err);
      throw err;
    }

    const extraSellerIds = [];
    for (const order of orders) {
      for (const line of order.Lines || []) {
        const sid = getExtraSellerId(line?.ExtraData);
        if (sid) extraSellerIds.push(String(sid));
      }
    }

    const sellerExistsCache = await buildSellerExistenceCache({
      productSellerMap,
      ceProductSellerMap,
      existingOrders: existingOrdersDb,
      extraSellerIds,
    });

    const entegraBrands = ENTEGRA_BRAND_MAP.map((b) => b.erpBrand.toLowerCase());

    const entegraSkuSet = new Set(
      productsDb
        .filter((p) => entegraBrands.includes(p.brand?.toLowerCase()))
        .map((p) => normalizeOrderSku(p.productSkuCode))
    );

    const entegraOrders = orders.filter(
      (order) =>
        Array.isArray(order.Lines) &&
        order.Lines.some((line) => entegraSkuSet.has(normalizeOrderSku(line.MerchantProductNo)))
    );

    let sentosSellerId = null;
    if (isSentosConfigured()) {
      const sentosSeller = await Seller.findOne({
        slug: sentosConfig.SENTOS_SELLER_SLUG,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      sentosSellerId = sentosSeller?._id ? String(sentosSeller._id) : null;
    }

    const sentosSkuSet = new Set(
      productsDb
        .filter((p) => sentosSellerId && String(p.sellerId) === sentosSellerId)
        .map((p) => normalizeOrderSku(p.productSkuCode))
    );

    const sentosOrders = orders.filter(
      (order) =>
        Array.isArray(order.Lines) &&
        order.Lines.some((line) => sentosSkuSet.has(normalizeOrderSku(line.MerchantProductNo)))
    );

    let respireSellerId = null;
    if (isRespireConfigured()) {
      const respireSeller = await Seller.findOne({
        slug: respireConfig.RESPIRE_SELLER_SLUG,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      respireSellerId = respireSeller?._id ? String(respireSeller._id) : null;
    }

    const respireSkuSet = new Set(
      productsDb
        .filter((p) => respireSellerId && String(p.sellerId) === respireSellerId)
        .map((p) => normalizeOrderSku(p.productSkuCode))
    );

    const respireOrders = orders.filter(
      (order) =>
        Array.isArray(order.Lines) &&
        order.Lines.some((line) => respireSkuSet.has(normalizeOrderSku(line.MerchantProductNo)))
    );

    //  final outputs
    const bulkOps = [];
    const sellerOrderPayloads = [];
    const pendingLogs = [];
    const pendingCourierReturns = [];

    //  LOOP (NO async map)
    for (const data of orders) {
      const existingOrder = existingOrdersMap.get(String(data.Id));

      // sellerId from first SKU (Product map), then order line ExtraData only (CE catalog resolved per line)
      let finalSellerId = null;
      if (Array.isArray(data.Lines) && data.Lines.length > 0) {
        const firstLine = data.Lines[0];
        const firstSku = normalizeOrderSku(firstLine.MerchantProductNo);
        if (firstSku) {
          finalSellerId = productSellerMap.get(firstSku) || null;
        }
        if (!finalSellerId) {
          finalSellerId = getExtraSellerId(firstLine?.ExtraData);
        }
      }

      const sellerIdSet = new Set();

      // SKU LIST
      const skuList = Array.isArray(data.Lines)
        ? data.Lines.map((line) => {
            const existingSku = findExistingSku(existingOrder, line);

            const resolution = resolveOrderLineSellerId({
              merchantProductNo: line.MerchantProductNo,
              productSellerMap,
              existingSku,
              extraData: line?.ExtraData,
              ceProductSellerMap,
              finalSellerId,
              sellerExistsCache,
            });

            const { sellerId } = resolution;
            const validation = validateResolvedSellerId(sellerId, sellerExistsCache);

            if (!validation.valid) {
              logUnresolvedSellerLine({
                orderId: data.Id,
                merchantProductNo: line.MerchantProductNo,
                resolution,
                validationReason: validation.reason,
                tag,
              });
              return null;
            }

            sellerIdSet.add(String(sellerId));

            const sellerOrderId = `${data.Id}_${sellerId}`;
            const extraStatus = getExtraStatus(line?.ExtraData);
            const normalizedExtraStatus = extraStatus?.toLowerCase();
            const qty = line.Quantity || 0;
            const statusBreakdown = buildStatusBreakdown({
              line,
              existingSku,
            });

            let skuStatus = resolveStoredSkuStatus({
              breakdown: statusBreakdown,
              qty,
              existingSku,
              extraDelivered: normalizedExtraStatus === 'delivered',
            });
            //  DELIVERY DETECTION

            const alreadyDelivered = existingSku?.status === 'DELIVERED';
            const isNowDelivered = normalizedExtraStatus === 'delivered' && !alreadyDelivered;
            //  RETURN DETECTION
            const alreadyReturned = existingSku?.status === 'RETURNED';
            const isNowReturned = normalizedExtraStatus === 'returned' && !alreadyReturned;

            if (isNowDelivered) {
              pendingLogs.push({
                orderId: data.Id, // string ID (important)
                sellerId,
                description: `SKU ${line.MerchantProductNo} has been delivered`,
                createdAt: new Date(),
                status: 'DELIVERED',
              });
            }
            if (isNowReturned) {
              pendingLogs.push({
                orderId: data.Id,
                sellerId,
                description: `SKU ${line.MerchantProductNo} has been returned`,
                createdAt: new Date(),
                status: 'RETURNED',
              });
            }
            const isNewlyReturned = skuStatus === 'RETURNED' && !alreadyReturned;
            if (isNewlyReturned) {
              pendingCourierReturns.push({
                orderId: data.Id,
                channelOrderNo: data.ChannelOrderNo,
                orderLineId: line.Id,
                merchantProductNo: line.MerchantProductNo,
                quantity: qty,
                sellerId,
                airWaybillNo: String(existingSku?.airWaybillNo || '').trim(),
              });
            }
            return {
              id: line.Id,
              sellerOrderId,
              sellerId,
              merchantProductNo: line.MerchantProductNo,
              quantity: line.Quantity,
              unitPriceInclVat: line.UnitPriceInclVat ?? 0,

              // ---------- STATUS ----------
              status: skuStatus,

              statusBreakdown,

              cancellationRequestedQuantity:
                existingSku?.cancellationRequestedQuantity ?? line.CancellationRequestedQuantity ?? 0,

              airWaybillNo: existingSku?.airWaybillNo ?? null,

              // METADATA
              channelOrderLineNo: line.ChannelOrderLineNo,
              isFulfillmentByMarketplace: line.IsFulfillmentByMarketplace ?? false,
              gtin: line.Gtin,
              description: line.Description,

              stockLocation: line.StockLocation
                ? {
                    id: line.StockLocation.Id,
                    name: line.StockLocation.Name,
                  }
                : undefined,

              // PRICING
              unitVat: line.UnitVat,
              lineTotalInclVat: line.LineTotalInclVat,
              lineVat: line.LineVat,

              originalUnitPriceInclVat: line.OriginalUnitPriceInclVat,
              originalUnitVat: line.OriginalUnitVat,
              originalLineTotalInclVat: line.OriginalLineTotalInclVat,
              originalLineVat: line.OriginalLineVat,
              originalFeeFixed: line.OriginalFeeFixed,

              bundleProductMerchantProductNo: line.BundleProductMerchantProductNo,
              bundleOrderLineId: line.BundleOrderLineId,

              jurisCode: line.JurisCode,
              jurisName: line.JurisName,
              vatRate: line.VatRate,

              unitPriceExclVat: line.UnitPriceExclVat,
              lineTotalExclVat: line.LineTotalExclVat,
              originalUnitPriceExclVat: line.OriginalUnitPriceExclVat,
              originalLineTotalExclVat: line.OriginalLineTotalExclVat,

              // EXTRA
              extraData: Array.isArray(line.ExtraData)
                ? line.ExtraData.map((e) => ({
                    key: e.Key,
                    value: String(e.Value),
                  }))
                : [],

              channelProductNo: line.ChannelProductNo,
              feeFixed: line.FeeFixed,
              feeRate: line.FeeRate,
              condition: line.Condition ?? 'UNKNOWN',

              // DATES
              exactDeliveryDate: line.ExactDeliveryDate,
              expectedDeliveryDate: line.ExpectedDeliveryDate,
              latestDeliveryDate: line.LatestDeliveryDate,
              exactShipmentDate: line.ExactShipmentDate,
              expectedShipmentDate: line.ExpectedShipmentDate,
              latestShipmentDate: line.LatestShipmentDate,
              cancelReason: existingSku?.cancelReason || (skuStatus === 'CANCELED' ? 'Other' : null),
            };
          }).filter(Boolean)
        : [];
      // IGNORE ORDER IF SKU LIST IS EMPTY
      if (!skuList.length) {
        console.warn(
          `${tag}.f SKIPPED order ${data.Id} (MerchantOrderNo=${data.MerchantOrderNo}) — no SKUs resolved to a valid seller (see unresolved seller logs above)`
        );
        continue;
      }
      const orderSellerIds = Array.from(sellerIdSet);
      const updatePayload = {
        orderId: data.Id?.toString(),
        channelOrderNumber: data.ChannelOrderNo,
        channelId: data.ChannelId,
        sellerId: finalSellerId,
        sellerIds: orderSellerIds, //  multi-seller support
        channelName: data.ChannelName,
        globalChannelName: data.GlobalChannelName,
        globalChannelId: data.GlobalChannelId,
        orderDate: data.OrderDate,
        merchantComment: data.MerchantComment,
        merchantOrderNo: data.MerchantOrderNo,
        isBusinessOrder: data.IsBusinessOrder,

        // TOTALS
        subTotalInclVat: data.SubTotalInclVat,
        subTotalVat: data.SubTotalVat,
        shippingCostsInclVat: data.ShippingCostsInclVat,
        totalInclVat: data.TotalInclVat,
        totalVat: data.TotalVat,

        subTotalExclVat: data.SubTotalExclVat,
        totalExclVat: data.TotalExclVat,
        shippingCostsExclVat: data.ShippingCostsExclVat,

        // ORIGINAL TOTALS
        originalSubTotalInclVat: data.OriginalSubTotalInclVat,
        originalSubTotalVat: data.OriginalSubTotalVat,
        originalShippingCostsInclVat: data.OriginalShippingCostsInclVat,
        originalShippingCostsVat: data.OriginalShippingCostsVat,
        originalTotalInclVat: data.OriginalTotalInclVat,
        originalTotalVat: data.OriginalTotalVat,

        originalSubTotalExclVat: data.OriginalSubTotalExclVat,
        originalShippingCostsExclVat: data.OriginalShippingCostsExclVat,
        originalTotalExclVat: data.OriginalTotalExclVat,

        // FEES
        originalSubTotalFee: data.OriginalSubTotalFee,
        subTotalFee: data.SubTotalFee,
        originalOrderFee: data.OriginalOrderFee,
        orderFee: data.OrderFee,
        originalTotalFee: data.OriginalTotalFee,
        totalFee: data.TotalFee,

        // CUSTOMER
        orderCustomer: {
          orderId: data?.Id ?? null,
          gender: data?.BillingAddress?.Gender ?? 'NA',
          firstName: data?.BillingAddress?.FirstName ?? 'NA',
          lastName: data?.BillingAddress?.LastName ?? 'NA',
          phone: data?.Phone ?? data?.BillingAddress?.Phone ?? 'NA',
          email: data?.Email ?? data?.BillingAddress?.Email ?? 'NA',
          languageCode: data?.LanguageCode ?? 'en',
          companyRegistrationNo: data?.CompanyRegistrationNo ?? null,
          channelCustomerNo: data?.ChannelCustomerNo ?? null,
        },

        // PAYMENT
        orderPaymentDetails: {
          orderId: data?.Id ?? 'NA',
          vatNo: data?.VatNo ?? 'NA',
          paymentMethod: data?.PaymentMethod ?? 'NA',
          paymentReferenceNo: data?.PaymentReferenceNo ?? 'NA',
          currencyCode: data?.CurrencyCode ?? 'NA',
        },

        // SKU LIST
        orderSkuList: {
          orderId: data.Id,
          skuList,
        },

        // SHIPPING ADDRESS
        orderShippingAddress: {
          line1: data?.ShippingAddress?.Line1 ?? 'NA',
          line2: data?.ShippingAddress?.Line2 ?? 'NA',
          line3: data?.ShippingAddress?.Line3 ?? 'NA',
          gender: data?.ShippingAddress?.Gender ?? 'NA',
          companyName: data?.ShippingAddress?.CompanyName ?? 'NA',
          firstName: data?.ShippingAddress?.FirstName ?? 'NA',
          lastName: data?.ShippingAddress?.LastName ?? 'NA',
          streetName: data?.ShippingAddress?.StreetName ?? 'NA',
          houseNr: data?.ShippingAddress?.HouseNr ?? 'NA',
          houseNrAddition: data?.ShippingAddress?.HouseNrAddition ?? 'NA',
          zipCode: data?.ShippingAddress?.ZipCode ?? 'NA',
          city: data?.ShippingAddress?.City ?? 'NA',
          region: data?.ShippingAddress?.Region ?? 'NA',
          countryIso: data?.ShippingAddress?.CountryIso ?? 'SA',
        },

        // BILLING ADDRESS
        orderBillingAddress: {
          line1: data?.BillingAddress?.Line1 ?? 'NA',
          line2: data?.BillingAddress?.Line2 ?? 'NA',
          line3: data?.BillingAddress?.Line3 ?? 'NA',
          gender: data?.BillingAddress?.Gender ?? 'NA',
          companyName: data?.BillingAddress?.CompanyName ?? 'NA',
          firstName: data?.BillingAddress?.FirstName ?? 'NA',
          lastName: data?.BillingAddress?.LastName ?? 'NA',
          streetName: data?.BillingAddress?.StreetName ?? 'NA',
          houseNr: data?.BillingAddress?.HouseNr ?? 'NA',
          houseNrAddition: data?.BillingAddress?.HouseNrAddition ?? 'NA',
          zipCode: data?.BillingAddress?.ZipCode ?? 'NA',
          city: data?.BillingAddress?.City ?? 'NA',
          region: data?.BillingAddress?.Region ?? 'NA',
          countryIso: data?.BillingAddress?.CountryIso ?? 'NA',
        },

        // status derived from fulfillment-resolved SKU statuses (same rules for all channels)
        status: resolveSanitizedOrderStatus(existingOrder, skuList),
      };

      //  Prepare SellerOrder payload (NO DB CALL HERE)
      sellerOrderPayloads.push({
        orderPayload: updatePayload,
      });

      // Order bulk
      const bulkOp = {
        updateOne: {
          filter: { orderId: String(data.Id), channelOrderNumber: data.ChannelOrderNo }, // FIXED UNIQUE FILTER
          update: { $set: updatePayload },
          upsert: true,
        },
      };

      bulkOps.push(bulkOp);
    }
    pushEntegraOrders(entegraOrders);
    pushSentosOrders(sentosOrders);
    pushRespireOrders(respireOrders);
    return {
      bulkOps,
      sellerOrderPayloads,
      pendingLogs,
      pendingCourierReturns,
    };
  } finally {
    // profiling timer removed
  }
};
export const deriveOrderStatusFromSkus = (skuList = []) => {
  const s = aggregateSkuStatus(skuList);

  const effectiveQty = s.total - s.canceled;

  // Fully canceled
  if (effectiveQty === 0 && s.canceled > 0) {
    return 'CANCELED';
  }

  // Fully delivered
  if (s.delivered === effectiveQty && effectiveQty > 0) {
    return 'CLOSED';
  }

  // Fully shipped (but not fully delivered)
  if (s.shipped + s.delivered === effectiveQty && s.delivered < effectiveQty) {
    return 'SHIPPED';
  }

  // Some progress happened
  if (s.confirmed > 0 || s.shipped > 0 || s.delivered > 0 || s.returned > 0) {
    return 'IN_PROGRESS';
  }

  // Default fallback
  return 'NEW';
};

const aggregateSkuStatus = (skuList = []) => {
  return skuList.reduce(
    (acc, sku) => {
      const b = sku.statusBreakdown || {};

      acc.confirmed += b.confirmed || 0;
      acc.shipped += b.shipped || 0;
      acc.delivered += b.delivered || 0;
      acc.returned += b.returned || 0;
      acc.canceled += b.canceled || 0;

      acc.total += sku.quantity || 0;

      return acc;
    },
    {
      total: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      canceled: 0,
    }
  );
};
const getExtraStatus = (extraData = []) => {
  const statusObj = extraData.find(
    (e) => e?.Key?.toLowerCase() === 'status' || e?.status // fallback if CE sends direct object
  );

  return (statusObj?.Value || statusObj?.status || '').toLowerCase();
};

const buildStatusBreakdown = ({ line, existingSku }) => {
  const qty = line.Quantity || 0;

  const prev = existingSku?.statusBreakdown ?? {};

  const base = {
    confirmed: prev.confirmed ?? 0,
    shipmentCreated: prev.shipmentCreated ?? 0,
    shipped: prev.shipped ?? 0,
    delivered: prev.delivered ?? 0,
    returned: prev.returned ?? 0,
    canceled: prev.canceled ?? 0,
  };

  const clamp = (n) => Math.max(n, 0);

  // ---------------- EXTRA DATA OVERRIDE (HIGHEST PRIORITY)
  const extraStatus = getExtraStatus(line.ExtraData);

  if (extraStatus === 'delivered') {
    return {
      confirmed: 0,
      shipmentCreated: 0,
      shipped: 0,
      delivered: qty,
      returned: base.returned,
      canceled: base.canceled,
    };
  }

  let result = { ...base };

  switch (line.Status) {
    case 'NEW':
    case 'IN_PROGRESS':
    case 'IN_COMBI': {
      const used = result.shipmentCreated + result.shipped + result.delivered + result.returned + result.canceled;

      result.confirmed = clamp(qty - used);
      break;
    }

    case 'SHIPPED': {
      const used = result.delivered + result.returned + result.canceled;

      result.shipped = clamp(qty - used);
      result.confirmed = 0;
      result.shipmentCreated = 0;
      break;
    }

    case 'DELIVERED': {
      result.delivered = qty;
      result.confirmed = 0;
      result.shipmentCreated = 0;
      result.shipped = 0;
      break;
    }

    case 'RETURNED': {
      const used = result.canceled;
      result.returned = clamp(qty - used);
      result.confirmed = 0;
      result.shipmentCreated = 0;
      result.shipped = 0;
      break;
    }

    case 'CANCELED':
    case 'MANCO': {
      const used = result.delivered + result.returned;

      result.canceled = clamp(qty - used);
      result.confirmed = 0;
      result.shipmentCreated = 0;
      result.shipped = 0;
      break;
    }

    case 'CLOSED': {
      const used = result.shipmentCreated + result.shipped + result.delivered + result.returned + result.canceled;

      result.confirmed = clamp(qty - used);
      break;
    }

    default:
      break;
  }

  // ---------------- FINAL NORMALIZATION (GUARANTEE TOTALS)
  const total =
    result.confirmed + result.shipmentCreated + result.shipped + result.delivered + result.returned + result.canceled;

  if (total > qty) {
    const overflow = total - qty;
    result.shipped = clamp(result.shipped - overflow);
  }

  return result;
};

export default {
  sanitizeOrdersData,
  getPeriodDate,
  flattenAggregatedOrder,
  getAggregatedOrderHeaders,
  getOrganizedOrderRowData,
};
