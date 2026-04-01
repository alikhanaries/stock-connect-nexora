import Channel from '#root/src/models/Channel.js';
import Order from '#root/src/models/Orders.js';
import Product from '#root/src/models/Product.js';
import { OCP_STATUS_MAP } from '../constants/common.js';

export const sanitizeOcpOrdersData = async (orders, sellerId) => {
  if (!orders?.length) return [];

  const orderIds = orders.map((data) => `${sellerId}${data.id}`);
  const skuSet = new Set();

  orders.forEach((order) => {
    const items = [...(order.unShippedItems || []), ...(order.shippedItems || []), ...(order.cancelledItems || [])];

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

  return orders.map((data) => {
    const orderId = `${sellerId}${data.id}`;
    const existingOrder = existingOrdersMap.get(orderId);

    const rawStatus = (data.status ?? data.Status ?? 'PENDING').toUpperCase();
    const mappedStatus = OCP_STATUS_MAP[rawStatus] || 'NEW';
    const sellerIDsSet = new Set();

    const allRawItems = [...(data.unShippedItems || []), ...(data.shippedItems || []), ...(data.cancelledItems || [])];

    const validItems = allRawItems.filter((item) => item.id);
    const merchantOrderNo = `${channelNo?.channelId ?? 6}_OCP_${orderId}`;
    const existingSkuMap = new Map(existingOrder?.orderSkuList?.skuList?.map((s) => [s.id, s]) || []);

    const skuList = validItems.map((line) => {
      const lineId = String(line.id);
      const trimmedSku = line.sku?.trim();
      const skuSellerId = productSellerMap.get(trimmedSku) || sellerId;
      if (skuSellerId) {
        sellerIDsSet.add(String(skuSellerId));
      }
      const existingSku = existingSkuMap.get(lineId);

      const qty = Number(line.quantity ?? 0);
      const rawPrice = line.effectiveLineItemPrice ?? line.price ?? 0;
      const price = Number(rawPrice);

      const rawLineStatus = (line.status ?? line.Status ?? 'PENDING').toUpperCase();
      const lineStatus = OCP_STATUS_MAP[rawLineStatus] || 'NEW';

      return {
        id: lineId,
        sellerId: skuSellerId,
        channelOrderLineNo: lineId,
        status: lineStatus,
        isFulfillmentByMarketplace: false,
        gtin: null,
        description: line.name ?? line.slug ?? '',
        stockLocation: null,

        unitVat: 0,
        lineTotalInclVat: price * qty,
        lineVat: 0,
        originalUnitPriceInclVat: price,
        originalUnitVat: 0,
        originalLineTotalInclVat: price * qty,
        originalLineTotalExclVat: 0,
        unitPriceExclVat: 0,
        lineTotalExclVat: 0,

        channelProductNo: String(line.nodeId ?? ''),
        merchantProductNo: line.sku ?? '',

        quantity: qty,
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
            Key: 'imageURI',
            Value: line.image?.imageURI ?? null,
          },
          {
            Key: 'slug',
            Value: line.slug ?? null,
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

    return {
      updateOne: {
        filter: { orderId },
        update: {
          $set: updatePayload,
          $setOnInsert: { sellerId },
        },
        upsert: true,
      },
    };
  });
};
