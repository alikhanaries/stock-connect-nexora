import Order from '#models/Orders.js';
import { formatValueForCSV } from './export.js';
import { formatDateTime } from './Common.js';
import Product from '../models/Product.js';

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
    flattened['orderSkuList_skuList_count'] = 0;
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
      flattened[`skuList_${k}_list`] = 'N/A';
    });
  } else {
    flattened['orderSkuList_skuList_count'] = skuList.length;

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
    'orderSkuList_skuList_count',
    'skuList_id_list',
    'skuList_merchantProductNo_list',
    'skuList_description_list',
    'skuList_quantity_list',
    'skuList_status_list',
    'skuList_unitPriceInclVat_list',
    'skuList_lineTotalInclVat_list',
    'skuList_gtin_list',
    'skuList_channelProductNo_list',
    'skuList_airWaybillNo_list',
    'skuList_condition_list',
    'skuList_vatRate_list',
    'skuList_unitVat_list',
    'skuList_lineVat_list',
    'skuList_expectedDeliveryDate_list',
    'skuList_expectedShipmentDate_list',
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

export const normalizeSkuStatus = (channelStatus) => {
 
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

const sanitizeOrdersData = async (orders) => {
  const orderIds = [];
  const skuSet = new Set();

  // Step 1: collect IDs & SKUs
  orders.forEach((order) => {
    if (order.Id) orderIds.push(order.Id);

    if (Array.isArray(order.Lines)) {
      order.Lines.forEach((line) => {
        if (line.MerchantProductNo) skuSet.add(line.MerchantProductNo);
      });
    }
  });

  // Step 2: fetch existing data
  const [existingOrdersDb, productsDb] = await Promise.all([
    Order.find({ orderId: { $in: orderIds } }).lean(),
    Product.find({ productSkuCode: { $in: Array.from(skuSet) } })
      .select('productSkuCode sellerId')
      .lean(),
  ]);

  const existingOrdersMap = new Map(existingOrdersDb.map((o) => [o.orderId, o]));
  const productSellerMap = new Map(productsDb.map((p) => [p.productSkuCode, p.sellerId]));

  // Step 3: map orders into bulkWrite operations
  return orders.map((data) => {
    const existingOrder = existingOrdersMap.get(String(data.Id));

    // Determine sellerId from first SKU
    let finalSellerId = null;
    if (Array.isArray(data.Lines) && data.Lines.length > 0) {
      const firstSku = data.Lines[0].MerchantProductNo;
      if (firstSku) finalSellerId = productSellerMap.get(firstSku) || null;
    }

    // Build SKU list with normalized statuses & preserved fields
    const skuList = Array.isArray(data.Lines)
      ? data.Lines.map((line) => {
          const existingSku = existingOrder?.orderSkuList?.skuList?.find((s) => s.id === line.Id);
          return {
            ...line,
            id: line.Id,
            channelOrderLineNo: line.ChannelOrderLineNo,
            //  CORRECT: schema-aligned status tracking
            statusBreakdown: buildStatusBreakdown({
              line,
              existingSku,
            }),
            airWaybillNo: existingSku?.airWaybillNo ?? null,
            merchantProductNo: line.MerchantProductNo,
            quantity: line.Quantity,
            status:
                  existingSku?.status === 'SHIPPED' ||
                  existingSku?.status === 'DELIVERED' ||
                  existingSku?.status === 'RETURNED' ||
                  existingSku?.status === 'CANCELED'
                    ? existingOrder?.status
                    : normalizeSkuStatus(line?.Status),
            cancellationRequestedQuantity:
              existingSku?.cancellationRequestedQuantity ?? line.CancellationRequestedQuantity,
          };
        })
      : [];

    // Build update payload
    const updatePayload = {
      orderId: data.Id,
      channelId: data.ChannelId,
      sellerId: finalSellerId,
      channelName: data.ChannelName,
      globalChannelName: data.GlobalChannelName,
      globalChannelId: data.GlobalChannelId,
      orderDate: data.OrderDate,
      merchantComment: data.MerchantComment,
      merchantOrderNo: data.MerchantOrderNo,
      isBusinessOrder: data.IsBusinessOrder,
      subTotalInclVat: data.SubTotalInclVat,
      subTotalVat: data.SubTotalVat,
      shippingCostsInclVat: data.ShippingCostsInclVat,
      totalInclVat: data.TotalInclVat,
      totalVat: data.TotalVat,
      originalSubTotalInclVat: data.OriginalSubTotalInclVat,
      originalSubTotalVat: data.OriginalSubTotalVat,
      originalShippingCostsInclVat: data.OriginalShippingCostsInclVat,
      originalShippingCostsVat: data.OriginalShippingCostsVat,
      originalTotalInclVat: data.OriginalTotalInclVat,
      originalTotalVat: data.OriginalTotalVat,
      subTotalExclVat: data.SubTotalExclVat,
      totalExclVat: data.TotalExclVat,
      shippingCostsExclVat: data.ShippingCostsExclVat,
      originalSubTotalExclVat: data.OriginalSubTotalExclVat,
      originalShippingCostsExclVat: data.OriginalShippingCostsExclVat,
      originalTotalExclVat: data.OriginalTotalExclVat,
      originalSubTotalFee: data.OriginalSubTotalFee,
      subTotalFee: data.SubTotalFee,
      originalOrderFee: data.OriginalOrderFee,
      orderFee: data.OrderFee,
      originalTotalFee: data.OriginalTotalFee,
      totalFee: data.TotalFee,
      orderCustomer: {
        orderId: data.Id,
        gender: data.BillingAddress.Gender,
        firstName: data.BillingAddress.FirstName,
        lastName: data.BillingAddress.LastName,
        phone: data.Phone,
        email: data.Email,
        languageCode: data.LanguageCode,
        companyRegistrationNo: data.CompanyRegistrationNo,
        channelCustomerNo: data.ChannelCustomerNo,
      },
      orderPaymentDetails: {
        orderId: data.Id,
        vatNo: data.VatNo,
        paymentMethod: data.PaymentMethod,
        paymentReferenceNo: data.PaymentReferenceNo,
        currencyCode: data.CurrencyCode,
      },
      orderSkuList: {
        orderId: data.Id,
        skuList,
      },
      orderShippingAddress: {
        line1: data.ShippingAddress.Line1,
        line2: data.ShippingAddress.Line2,
        line3: data.ShippingAddress.Line3,
        gender: data.ShippingAddress.Gender,
        companyName: data.ShippingAddress.CompanyName,
        firstName: data.ShippingAddress.FirstName,
        lastName: data.ShippingAddress.LastName,
        streetName: data.ShippingAddress.StreetName,
        houseNr: data.ShippingAddress.HouseNr,
        houseNrAddition: data.ShippingAddress.HouseNrAddition,
        zipCode: data.ShippingAddress.ZipCode,
        city: data.ShippingAddress.City,
        region: data.ShippingAddress.Region,
        countryIso: data.ShippingAddress.CountryIso,
      },
      orderBillingAddress: {
        line1: data.BillingAddress.Line1,
        line2: data.BillingAddress.Line2,
        line3: data.BillingAddress.Line3,
        gender: data.BillingAddress.Gender,
        companyName: data.BillingAddress.CompanyName,
        firstName: data.BillingAddress.FirstName,
        lastName: data.BillingAddress.LastName,
        streetName: data.BillingAddress.StreetName,
        houseNr: data.BillingAddress.HouseNr,
        houseNrAddition: data.BillingAddress.HouseNrAddition,
        zipCode: data.BillingAddress.ZipCode,
        city: data.BillingAddress.City,
        region: data.BillingAddress.Region,
        countryIso: data.BillingAddress.CountryIso,
      },
      status:
            existingOrder?.status === 'SHIPPED' ||
            existingOrder?.status === 'CLOSED' ||
            existingOrder?.status === 'CANCELED' ||
            existingOrder?.status === 'RETURNED'
          ? existingOrder?.status
          : normalizeSkuStatus(data?.Status),
    };

    return {
      updateOne: {
        filter: { orderId: data.Id },
        update: { $set: updatePayload },
        upsert: true,
      },
    };
  });
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

  const empty = {
    confirmed: 0,
    shipped: prev.shipped ?? 0,
    delivered: prev.delivered ?? 0,
    returned: prev.returned ?? 0,
    canceled: prev.canceled ?? 0,
    shipmentCreated: prev.shipmentCreated ?? 0,
  };

  // EXTRA DATA OVERRIDE (highest priority)
  const extraStatus = getExtraStatus(line.ExtraData);

  if (extraStatus === 'delivered') {
    return {
      ...empty,
      delivered: qty,
      confirmed: 0,
      shipped: 0,
      shipmentCreated: 0,
    };
  }

  switch (line.Status) {
    case 'NEW':
    case 'IN_PROGRESS':
    case 'IN_COMBI':
      return {
        ...empty,
        confirmed: Math.max(qty - empty.shipmentCreated - empty.shipped - empty.delivered - empty.canceled, 0),
      };

    case 'SHIPPED':
      return {
        ...empty,
        shipped: qty,
      };

    case 'DELIVERED':
      return {
        ...empty,
        delivered: qty,
        confirmed: 0,
        shipped: 0,
        shipmentCreated: 0,
      };

    case 'RETURNED':
      return {
        ...empty,
        returned: qty,
      };

    case 'CANCELED':
    case 'MANCO':
      return {
        ...empty,
        canceled: qty,
        confirmed: 0,
        shipped: 0,
        shipmentCreated: 0,
      };
    case 'CLOSED':
      return {
        ...empty,
        confirmed: Math.max(qty - empty.shipped - empty.delivered - empty.canceled, 0),
      };
    default:
      return empty;
  }
};
export default {
  sanitizeOrdersData,
  getPeriodDate,
  flattenAggregatedOrder,
  getAggregatedOrderHeaders,
  getOrganizedOrderRowData,
};
