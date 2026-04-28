import Channel from '#root/src/models/Channel.js';
import Order from '#root/src/models/Orders.js';
import Product from '#root/src/models/Product.js';
import { OCP_STATUS_MAP } from '../constants/common.js';

export const sanitizeOcpOrdersData = async (orders, sellerId) => {
  if (!orders?.length) return { bulkOps: [], sellerOrderPayloads: [] };

  const orderIds = orders.map((data) => `${sellerId}${data.id}`);
  const skuSet = new Set();

  orders.forEach((order) => {
    const items = [
      ...(order.unShippedItems || []),
      ...flattenShippedItems(order.shippedItems),
      ...(order.cancelledItems || []),
    ];

    items.forEach((item) => {
      if (item?.sku) skuSet.add(item.sku.trim());
    });
  });

  const [channelNo, existingOrdersDb, productDocs] = await Promise.all([
    Channel.findOne({ channelName: 'OCP' }).select('channelId globalChannelId -_id').lean(),
    Order.find({
      orderId: { $in: orderIds },
    }).lean(),

    Product.find({
      productSkuCode: { $in: Array.from(skuSet) },
    })
      .select('productSkuCode sellerId')
      .lean(),
  ]);

  const existingOrdersMap = new Map(existingOrdersDb.map((order) => [order.orderId, order]));
  const productSellerMap = new Map(productDocs.map((p) => [p.productSkuCode, p.sellerId]));

  const bulkOps = [];
  const sellerOrderPayloads = [];

  for (const data of orders) {
    const orderId = `${sellerId}${data.id}`;
    const existingOrder = existingOrdersMap.get(orderId);

    const rawStatus = (data.status ?? data.Status ?? 'PENDING').toUpperCase();
    const mappedStatus = OCP_STATUS_MAP[rawStatus] || 'NEW';
    const sellerIDsSet = new Set();

    const allRawItems = [
      ...(data.unShippedItems || []).map((item) => ({ ...item, _source: 'unshipped' })),
      ...flattenShippedItems(data.shippedItems).map((item) => ({ ...item, _source: 'shipped' })),
      ...(data.cancelledItems || []).map((item) => ({ ...item, _source: 'canceled' })),
    ];

    const validItems = allRawItems.filter((item) => item.id);
    const merchantOrderNo = `${channelNo?.channelId ?? 6}_OCP_${orderId}`;
    const existingSkuMap = new Map(existingOrder?.orderSkuList?.skuList?.map((s) => [s.id, s]) || []);

    // Aggregate items by SKU code — same product can appear across unShippedItems, shippedItems, cancelledItems
    const skuAggMap = new Map();

    validItems.forEach((line) => {
      const trimmedSku = line.sku?.trim();
      if (!trimmedSku) return;

      const qty = Number(line.quantity ?? 0);
      const breakdown = getSourceBreakdown(line._source, line.shipmentStatus, qty);

      if (skuAggMap.has(trimmedSku)) {
        const agg = skuAggMap.get(trimmedSku);
        agg.totalQty += qty;
        agg.breakdown.confirmed += breakdown.confirmed;
        agg.breakdown.shipped += breakdown.shipped;
        agg.breakdown.delivered += breakdown.delivered;
        agg.breakdown.returned += breakdown.returned;
        agg.breakdown.canceled += breakdown.canceled;
        agg.breakdown.shipmentCreated += breakdown.shipmentCreated;
        // keep first encountered line as the representative
      } else {
        skuAggMap.set(trimmedSku, {
          line,
          totalQty: qty,
          breakdown: { ...breakdown },
        });
      }
    });

    const skuList = Array.from(skuAggMap.values()).map(({ line, totalQty, breakdown }) => {
      const trimmedSku = line.sku?.trim();
      const lineId = String(line.id);
      const skuSellerId = productSellerMap.get(trimmedSku) || sellerId;
      if (skuSellerId) {
        sellerIDsSet.add(String(skuSellerId));
      }
      const existingSku = existingSkuMap.get(lineId);

      const rawPrice = line.effectiveLineItemPrice ?? line.price ?? 0;
      const price = Number(rawPrice);

      const rawLineStatus = (line.status ?? line.Status ?? 'PENDING').toUpperCase();
      const lineStatus = OCP_STATUS_MAP[rawLineStatus] || 'NEW';

      const statusBreakdown = existingSku?.statusBreakdown ?? breakdown;

      return {
        id: lineId,
        sellerId: skuSellerId,
        channelOrderLineNo: lineId,
        status: lineStatus,
        statusBreakdown,
        isFulfillmentByMarketplace: false,
        gtin: null,
        description: line.name ?? line.slug ?? '',
        stockLocation: null,

        unitVat: 0,
        lineTotalInclVat: price * totalQty,
        lineVat: 0,
        originalUnitPriceInclVat: price,
        originalUnitVat: 0,
        originalLineTotalInclVat: price * totalQty,
        originalLineTotalExclVat: 0,
        unitPriceExclVat: 0,
        lineTotalExclVat: 0,

        channelProductNo: String(line.nodeId ?? ''),
        merchantProductNo: trimmedSku ?? '',

        quantity: totalQty,
        cancellationRequestedQuantity: existingSku?.cancellationRequestedQuantity ?? 0,

        unitPriceInclVat: price,
        feeFixed: 0,
        feeRate: 0,
        condition: 'NEW',

        exactDeliveryDate: null,
        expectedDeliveryDate: null,
        latestDeliveryDate: null,
        exactShipmentDate: null,
        expectedShipmentDate: null,
        latestShipmentDate: null,

        airWaybillNo: existingSku?.airWaybillNo ?? null,
        extraData: [
          {
            key: 'imageURI',
            value: line.image?.imageURI ?? '',
          },
          {
            key: 'status',
            value: String(lineStatus).toLowerCase(),
          },
          {
            key: 'sellerId',
            value: String(skuSellerId ?? ''),
          },
          {
            key: 'slug',
            value: line.slug ?? null,
          },
        ],
      };
    });

    const createdAt = data.createdAt ?? data.CreatedAt ?? new Date();

    const amounts = data.amounts || data.Amounts || {};
    const subTotal = Number(amounts.subTotal ?? amounts.SubTotal ?? 0);
    const shipping = Number(amounts.shippingCharges ?? amounts.ShippingCharges ?? 0);
    const total = Number(amounts.total ?? amounts.Total ?? 0);
    const tax = Number(amounts.tax ?? amounts.Tax ?? 0);

    const cust = data.customer || data.Customer || {};
    const shipAddr = cust.shippingAddress || cust.ShippingAddress || {};
    const billAddr = cust.billingAddress || cust.BillingAddress || {};

    const updatePayload = {
      orderId,
      channelId: Number(channelNo?.channelId ?? 6),
      channelName: 'OCP',
      status: mappedStatus,
      globalChannelName: 'OCP',
      globalChannelId: Number(channelNo?.globalChannelId ?? 0),
      orderDate: createdAt,
      merchantComment: null,
      merchantOrderNo,
      isBusinessOrder: false,

      subTotalInclVat: subTotal,
      subTotalVat: 0,
      shippingCostsInclVat: shipping,
      totalInclVat: total,
      totalVat: tax,
      totalExclVat: subTotal,
      sellerIds: Array.from(sellerIDsSet),

      originalSubTotalInclVat: subTotal,
      originalShippingCostsInclVat: shipping,
      originalTotalInclVat: total,
      originalTotalVat: tax,

      subTotalFee: 0,
      totalFee: 0,
      orderFee: 0,

      orderCustomer: {
        orderId,
        gender: null,
        firstName: cust.firstName ?? cust.FirstName,
        lastName: cust.lastName ?? cust.LastName,
        phone: cust.phoneNumber ?? cust.PhoneNumber,
        email: cust.email ?? cust.Email,
        languageCode: null,
        companyRegistrationNo: null,
        channelCustomerNo: String(cust.id ?? cust.Id ?? ''),
      },
      orderPaymentDetails: {
        orderId,
        vatNo: null,
        paymentMethod: data.paymentMethod ?? data.PaymentMethod ?? 'UNKNOWN',
        paymentReferenceNo: data.transactionId ?? data.TransactionId ?? null,
        currencyCode: 'SAR',
      },
      orderSkuList: {
        orderId,
        skuList,
      },
      orderShippingAddress: {
        line1: shipAddr.line1 ?? shipAddr.Line1 ?? '',
        firstName: shipAddr.firstName ?? shipAddr.FirstName,
        lastName: shipAddr.lastName ?? shipAddr.LastName,
        streetName: shipAddr.street ?? shipAddr.Street,
        zipCode: shipAddr.zipCode ?? shipAddr.ZipCode,
        city: shipAddr.city,
        region: shipAddr.state === 'NA' ? shipAddr.city : shipAddr.state,
        countryIso: 'SA',
      },
      orderBillingAddress: {
        line1: billAddr.line1 ?? billAddr.Line1 ?? '',
        line2: null,
        line3: null,
        gender: null,
        companyName: null,
        firstName: billAddr.firstName ?? billAddr.FirstName,
        lastName: billAddr.lastName ?? billAddr.LastName,
        streetName: billAddr.street ?? billAddr.Street,
        houseNr: null,
        houseNrAddition: null,
        zipCode: billAddr.zipCode ?? billAddr.ZipCode,
        city: billAddr.city ?? billAddr.City,
        region: billAddr.state ?? billAddr.State,
        countryIso: billAddr.country ?? billAddr.Country,
      },
    };

    sellerOrderPayloads.push({ orderPayload: updatePayload });

    bulkOps.push({
      updateOne: {
        filter: { orderId },
        update: {
          $set: updatePayload,
          $setOnInsert: { sellerId },
        },
        upsert: true,
      },
    });
  }
  return { bulkOps, sellerOrderPayloads };
};

const flattenShippedItems = (shippedItems) => {
  if (!shippedItems?.length) return [];
  return shippedItems.flatMap((shipment) =>
    (shipment.lineItems || []).map((item) => ({
      ...item,
      _trackingNumber: shipment.trackingNumber ?? null,
      _shipmentId: shipment.shipmentId ?? null,
      _externalShipmentId: shipment.externalShipmentId ?? null,
      _shipmentReferenceId: shipment.shipmentReferenceId ?? null,
    }))
  );
};

const getSourceBreakdown = (source, shipmentStatus, qty) => {
  const empty = {
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    returned: 0,
    canceled: 0,
    shipmentCreated: 0,
  };

  if (source === 'canceled') {
    return { ...empty, canceled: qty };
  }

  if (source === 'shipped') {
    const upper = (shipmentStatus || '').toUpperCase();
    if (upper === 'SHIPMENT_CREATED') return { ...empty, shipmentCreated: qty };
    if (upper === 'OUT_FOR_DELIVERY') return { ...empty, shipped: qty };
    if (upper === 'DELIVERED') return { ...empty, delivered: qty };
    return { ...empty, shipmentCreated: qty };
  }

  // unshipped items are confirmed
  return { ...empty, confirmed: qty };
};
