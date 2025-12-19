import Order from '#root/src/models/Orders.js';

export const sanitizeOcpOrdersData = async (orders, sellerId) => {
  const orderIds = orders.map((data) => String(data.id));

  const existingOrdersDb = await Order.find({
    orderId: { $in: orderIds },
  }).lean();

  const existingOrdersMap = new Map(existingOrdersDb.map((order) => [order.orderId, order]));

  return orders.map((data) => {
    const orderIdRaw = `${sellerId}${data.id}`;

    const existingOrder = existingOrdersMap.get(String(orderIdRaw));

    const allRawItems = [...(data.unShippedItems || []), ...(data.shippedItems || []), ...(data.cancelledItems || [])];

    const validItems = allRawItems.filter((item) => item.id);
    const merchantOrderNo = `6_OCP_${orderIdRaw}`;

    const skuList = validItems.map((line) => {
      const lineId = String(line.id);

      const lineName = line.name ?? '';
      const lineSku = line.sku ?? '';
      const lineNodeId = String(line.nodeId ?? '');

      const qty = Number(line.quantity ?? 0);
      const rawPrice = line.effectiveLineItemPrice ?? line.price ?? 0;
      const price = Number(rawPrice);

      const existingSku = existingOrder?.orderSkuList?.skuList?.find((s) => s.id === lineId);
      const lineStatus = line.status ?? line.Status ?? 'PENDING';

      const imageUri = line.image?.imageURI ?? null;
      const slug = line.slug ?? null;

      return {
        id: lineId,
        channelOrderLineNo: lineId,
        status: existingSku ? existingSku.status : lineStatus,
        isFulfillmentByMarketplace: false,
        gtin: null,
        description: lineName,
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

        channelProductNo: lineNodeId,
        merchantProductNo: lineSku,

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
          { Key: 'imageURI', Value: imageUri },
          { Key: 'slug', Value: slug },
        ],
      };
    });

    const orderId = String(orderIdRaw);
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
      orderId: orderId,
      channelId: 6,
      channelName: 'OCP',
      globalChannelName: 'OCP',
      globalChannelId: null,
      orderDate: createdAt,
      merchantComment: null,
      merchantOrderNo: merchantOrderNo,
      isBusinessOrder: false,

      subTotalInclVat: subTotal,
      subTotalVat: 0,
      shippingCostsInclVat: shipping,
      totalInclVat: total,
      totalVat: tax,

      originalSubTotalInclVat: subTotal,
      originalShippingCostsInclVat: shipping,
      originalTotalInclVat: total,
      originalTotalVat: tax,

      subTotalFee: 0,
      totalFee: 0,
      orderFee: 0,

      orderCustomer: {
        orderId: orderId,
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
        orderId: orderId,
        vatNo: null,
        paymentMethod: data.paymentMethod ?? data.PaymentMethod ?? 'UNKNOWN',
        paymentReferenceNo: data.transactionId ?? data.TransactionId ?? null,
        currencyCode: 'SAR',
      },
      orderSkuList: {
        orderId: orderId,
        skuList,
      },
      orderShippingAddress: {
        line1: shipAddr.line1 ?? shipAddr.Line1 ?? '',
        line2: null,
        line3: null,
        gender: null,
        companyName: null,
        firstName: shipAddr.firstName ?? shipAddr.FirstName,
        lastName: shipAddr.lastName ?? shipAddr.LastName,
        streetName: shipAddr.street ?? shipAddr.Street,
        houseNr: null,
        houseNrAddition: null,
        zipCode: shipAddr.zipCode ?? shipAddr.ZipCode,
        city: shipAddr.city ?? shipAddr.City,
        region: shipAddr.state ?? shipAddr.State,
        countryIso: shipAddr.country ?? shipAddr.Country,
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

    if (!existingOrder) {
      updatePayload.status = data.status ?? data.Status ?? 'PENDING';
    }

    const updateOperation = {
      $set: updatePayload,
      $setOnInsert: {
        sellerId: sellerId,
      },
    };

    return {
      updateOne: {
        filter: { orderId: orderId },
        update: updateOperation,
        upsert: true,
      },
    };
  });
};
