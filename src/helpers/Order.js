import Order from '#models/Orders.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Channel from '../models/Channel.js';
import { formatValueForCSV } from './export.js';
import { formatDateTime } from './Common.js';
import { AMAZON_STATUS_MAP, ORDER_STATUS_MAP } from '#constants/common.js';

const resolveStatus = ({ existingStatus, incomingStatus }) => {
  // Highest priority
  if (incomingStatus === ORDER_STATUS_MAP.MANCO) {
    return ORDER_STATUS_MAP.CANCELED;
  }

  // Allow explicit close
  if (incomingStatus === ORDER_STATUS_MAP.CLOSED) {
    return ORDER_STATUS_MAP.CLOSED;
  }

  // IN_COMBI always moves to IN_PROGRESS
  if (incomingStatus === ORDER_STATUS_MAP.IN_COMBI) {
    return ORDER_STATUS_MAP.IN_PROGRESS;
  }

  // Default behavior
  return existingStatus ?? incomingStatus;
};

export const sanitizeAmazonOrdersData = async (orders, defaultSellerId) => {
  const orderMap = new Map();

  orders.forEach((row) => {
    const orderId = row.orderId;
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        orderInfo: row,
        items: [],
      });
    }
    orderMap.get(orderId).items.push(row);
  });

  const orderIds = Array.from(orderMap.keys());

  const skuSet = new Set();
  orders.forEach((row) => {
    if (row.sku) skuSet.add(row.sku);
  });

  const brandNameSet = new Set();
  orders.forEach((row) => {
    if (row.brandName) brandNameSet.add(row.brandName.toLowerCase().trim());
  });

  const brandOrQuery =
    brandNameSet.size > 0
      ? Array.from(brandNameSet).map((brand) => ({
          name: { $regex: new RegExp(`^${brand}$`, 'i') },
        }))
      : [{ _id: null }];

  const [existingOrdersDb, productsDb, sellersDb, amazonChannel] = await Promise.all([
    Order.find({ orderId: { $in: orderIds } }).lean(),
    Product.find({ productSkuCode: { $in: Array.from(skuSet) } })
      .select('productSkuCode sellerId')
      .lean(),
    Seller.find({
      $or: brandOrQuery,
      isDeleted: false,
    })
      .select('_id name')
      .lean(),
    Channel.findOne({ globalChannelId: 1635 }).select('channelId channelName globalChannelId globalChannelName').lean(),
  ]);

  const channelInfo = amazonChannel || {
    channelId: 3,
    channelName: 'Amazon.sa (v3)',
    globalChannelId: 1635,
    globalChannelName: 'Amazon',
  };

  const existingOrdersMap = new Map(existingOrdersDb.map((o) => [o.orderId, o]));
  const productSellerMap = new Map(productsDb.map((p) => [p.productSkuCode, p.sellerId]));

  const brandSellerMap = new Map();
  sellersDb.forEach((seller) => {
    brandSellerMap.set(seller.name.toLowerCase().trim(), seller._id);
  });

  const operations = [];

  for (const [orderId, orderData] of orderMap) {
    const { orderInfo, items } = orderData;
    const existingOrder = existingOrdersMap.get(orderId);

    let finalSellerId = null;

    if (orderInfo.brandName) {
      const brandKey = orderInfo.brandName.toLowerCase().trim();
      finalSellerId = brandSellerMap.get(brandKey) || null;
    }

    if (!finalSellerId && items.length > 0) {
      const firstSku = items[0].sku;
      if (firstSku) {
        finalSellerId = productSellerMap.get(firstSku) || null;
      }
    }

    if (!finalSellerId) {
      finalSellerId = defaultSellerId;
    }
    const purchaseDate = parseAmazonDate(orderInfo.purchaseDate);

    let totalPrice = 0;
    let totalTax = 0;
    let totalShipping = 0;

    items.forEach((item) => {
      totalPrice += parseFloat(item.itemPrice) || 0;
      totalTax += parseFloat(item.itemTax) || 0;
      totalShipping += parseFloat(item.shippingPrice) || 0;
    });

    const skuList = items.map((item, index) => {
      const existingSku = existingOrder?.orderSkuList?.skuList?.find(
        (s) => s.id === item.orderItemId || s.merchantProductNo === item.sku
      );

      const qty = parseInt(item.quantityPurchased) || 1;
      const mappedStatus = existingSku?.status || mapAmazonStatus(item.orderStatus);

      const statusBreakdown = existingSku?.statusBreakdown ?? buildAmazonStatusBreakdown(mappedStatus, qty);

      return {
        id: item.orderItemId || `${orderId}-${index}`,
        channelOrderLineNo: item.orderItemId,
        status: mappedStatus,
        statusBreakdown,
        isFulfillmentByMarketplace: false,
        gtin: null,
        description: item.productName,
        stockLocation: null,
        unitVat: parseFloat(item.itemTax) || 0,
        lineTotalInclVat: parseFloat(item.itemPrice) || 0,
        lineVat: parseFloat(item.itemTax) || 0,
        originalUnitPriceInclVat: parseFloat(item.itemPrice) || 0,
        originalUnitVat: parseFloat(item.itemTax) || 0,
        originalLineTotalInclVat: parseFloat(item.itemPrice) || 0,
        originalLineVat: parseFloat(item.itemTax) || 0,
        originalFeeFixed: 0,
        bundleProductMerchantProductNo: null,
        bundleOrderLineId: null,
        jurisCode: null,
        jurisName: null,
        vatRate: 0,
        unitPriceExclVat: parseFloat(item.itemPrice) || 0,
        lineTotalExclVat: parseFloat(item.itemPrice) || 0,
        originalUnitPriceExclVat: parseFloat(item.itemPrice) || 0,
        originalLineTotalExclVat: parseFloat(item.itemPrice) || 0,
        extraData: null,
        channelProductNo: item.orderItemId,
        merchantProductNo: item.sku,
        quantity: qty,
        cancellationRequestedQuantity: existingSku?.cancellationRequestedQuantity || 0,
        unitPriceInclVat: parseFloat(item.itemPrice) || 0,
        feeFixed: parseFloat(item.paymentMethodFee) || 0,
        feeRate: 0,
        condition: null,
        exactDeliveryDate: null,
        expectedDeliveryDate: item.deliveryEndDate ? new Date(item.deliveryEndDate) : null,
        latestDeliveryDate: null,
        exactShipmentDate: null,
        expectedShipmentDate: null,
        latestShipmentDate: null,
        airWaybillNo: existingSku?.airWaybillNo || null,
      };
    });

    const incomingStatus = mapAmazonStatus(orderInfo.orderStatus);
    const finalStatus = resolveStatus({
      existingStatus: existingOrder?.status,
      incomingStatus,
    });

    const updatePayload = {
      orderId: orderId,
      channelId: channelInfo.channelId,
      sellerId: finalSellerId,
      channelName: channelInfo.channelName,
      globalChannelName: channelInfo.globalChannelName,
      globalChannelId: channelInfo.globalChannelId,
      orderDate: purchaseDate,
      merchantComment: null,
      merchantOrderNo: `${channelInfo.globalChannelId}-${orderId}`,
      isBusinessOrder: false,
      subTotalInclVat: totalPrice,
      subTotalVat: totalTax,
      shippingCostsInclVat: totalShipping,
      totalInclVat: totalPrice + totalShipping,
      totalVat: totalTax,
      originalSubTotalInclVat: totalPrice,
      originalSubTotalVat: totalTax,
      originalShippingCostsInclVat: totalShipping,
      originalShippingCostsVat: 0,
      originalTotalInclVat: totalPrice + totalShipping,
      originalTotalVat: totalTax,
      subTotalExclVat: totalPrice - totalTax,
      totalExclVat: totalPrice + totalShipping - totalTax,
      shippingCostsExclVat: totalShipping,
      originalSubTotalExclVat: totalPrice - totalTax,
      originalShippingCostsExclVat: totalShipping,
      originalTotalExclVat: totalPrice + totalShipping - totalTax,
      originalSubTotalFee: 0,
      subTotalFee: 0,
      originalOrderFee: 0,
      orderFee: 0,
      originalTotalFee: 0,
      totalFee: 0,
      status: finalStatus,
      orderCustomer: {
        orderId: orderId,
        gender: null,
        firstName: orderInfo.buyerName?.split(' ')[0] || '',
        lastName: orderInfo.buyerName?.split(' ').slice(1).join(' ') || '',
        phone: orderInfo.buyerPhoneNumber || orderInfo.shipPhoneNumber || '',
        email: orderInfo.buyerEmail || '',
        languageCode: null,
        companyRegistrationNo: null,
        channelCustomerNo: null,
      },
      orderPaymentDetails: {
        orderId: orderId,
        vatNo: null,
        paymentMethod: orderInfo.paymentMethod || 'Amazon',
        paymentReferenceNo: null,
        currencyCode: orderInfo.currency || 'SAR',
      },
      orderSkuList: {
        orderId: orderId,
        skuList,
      },
      orderShippingAddress: {
        line1: orderInfo.shipAddress1 || '',
        line2: orderInfo.shipAddress2 || '',
        line3: orderInfo.shipAddress3 || '',
        gender: null,
        companyName: null,
        firstName: orderInfo.recipientName?.split(' ')[0] || '',
        lastName: orderInfo.recipientName?.split(' ').slice(1).join(' ') || '',
        streetName: orderInfo.shipAddress1 || '',
        houseNr: orderInfo.shipAddress2 || '',
        houseNrAddition: null,
        zipCode: orderInfo.shipPostalCode || '',
        city: orderInfo.shipCity || '',
        region: orderInfo.shipState || '',
        countryIso: orderInfo.shipCountry || 'SA',
      },
      orderBillingAddress: {
        line1: orderInfo.shipAddress1 || '',
        line2: orderInfo.shipAddress2 || '',
        line3: orderInfo.shipAddress3 || '',
        gender: null,
        companyName: null,
        firstName: orderInfo.buyerName?.split(' ')[0] || '',
        lastName: orderInfo.buyerName?.split(' ').slice(1).join(' ') || '',
        streetName: orderInfo.shipAddress1 || '',
        houseNr: orderInfo.shipAddress2 || '',
        houseNrAddition: null,
        zipCode: orderInfo.shipPostalCode || '',
        city: orderInfo.shipCity || '',
        region: orderInfo.shipState || '',
        countryIso: orderInfo.shipCountry || 'SA',
      },
    };

    operations.push({
      updateOne: {
        filter: { orderId: orderId },
        update: { $set: updatePayload },
        upsert: true,
      },
    });
  }

  console.log('Total operations to execute:', operations.length);
  return operations;
};

const parseAmazonDate = (dateStr) => {
  if (!dateStr) return new Date();

  try {
    const parts = dateStr.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '0:00';

    const [month, day, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    const fullYear = year < 100 ? 2000 + year : year;

    return new Date(fullYear, month - 1, day, hour, minute);
  } catch {
    return new Date();
  }
};

const mapAmazonStatus = (amazonStatus) => {
  if (!amazonStatus) return 'NEW';
  return AMAZON_STATUS_MAP[amazonStatus] || 'NEW';
};

const buildAmazonStatusBreakdown = (status, qty) => {
  const empty = {
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    returned: 0,
    canceled: 0,
    shipmentCreated: 0,
  };

  switch (status) {
    case 'NEW':
    case 'IN_PROGRESS':
    case 'PENDING':
      return { ...empty, confirmed: qty };
    case 'SHIPPED':
      return { ...empty, shipped: qty };
    case 'DELIVERED':
      return { ...empty, delivered: qty };
    case 'RETURNED':
      return { ...empty, returned: qty };
    case 'CANCELED':
      return { ...empty, canceled: qty };
    default:
      return { ...empty, confirmed: qty };
  }
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

export const normalizeSkuStatus = (skuStatus) => {
  switch (skuStatus) {
    case 'NEW':
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
          const existingSku = existingOrder?.orderSkuList?.skuList?.find((s) => String(s.id) === String(line.Id));

          return {
            // ---------- REQUIRED ----------
            id: line.Id,
            merchantProductNo: line.MerchantProductNo,
            quantity: line.Quantity,
            unitPriceInclVat: line.UnitPriceInclVat ?? 0,

            // ---------- STATUS ----------
            status: ['SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELED'].includes(existingSku?.status)
              ? existingSku.status
              : normalizeSkuStatus(line.Status),

            statusBreakdown: buildStatusBreakdown({
              line,
              existingSku,
            }),

            cancellationRequestedQuantity:
              existingSku?.cancellationRequestedQuantity ?? line.CancellationRequestedQuantity ?? 0,

            airWaybillNo: existingSku?.airWaybillNo ?? null,

            // ---------- OPTIONAL / METADATA ----------
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

            exactDeliveryDate: line.ExactDeliveryDate,
            expectedDeliveryDate: line.ExpectedDeliveryDate,
            latestDeliveryDate: line.LatestDeliveryDate,
            exactShipmentDate: line.ExactShipmentDate,
            expectedShipmentDate: line.ExpectedShipmentDate,
            latestShipmentDate: line.LatestShipmentDate,
          };
        })
      : [];

    // Build update payload
    const updatePayload = {
      orderId: data.Id,
      channelOrderNumber: data.ChannelOrderNo,
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

      status: ['SHIPPED', 'CLOSED', 'RETURNED', 'CANCELED'].includes(existingOrder?.status)
        ? existingOrder.status
        : normalizeOrderStatus(data?.Status),
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
  sanitizeAmazonOrdersData,
  getPeriodDate,
  flattenAggregatedOrder,
  getAggregatedOrderHeaders,
  getOrganizedOrderRowData,
};
