export const isNameOrEmailSearch = (searchTerm) => {
  if (!searchTerm) return false;

  const emailPattern = /@/;
  if (emailPattern.test(searchTerm)) return true;

  const namePattern = /[a-zA-Z]/;
  if (namePattern.test(searchTerm)) {
    const isLikelyId =
      /^[0-9]+$/.test(searchTerm.trim()) || (/^[A-Z0-9]+$/i.test(searchTerm.trim()) && searchTerm.length >= 5);
    return !isLikelyId;
  }

  return false;
};

export const formatReturnWithOrderData = async (returns, searchTerm = null, Order) => {
  if (!returns || returns.length === 0) {
    return [];
  }

  const merchantOrderNos = [...new Set(returns.map((returnItem) => returnItem.merchantOrderNo).filter(Boolean))];

  if (merchantOrderNos.length === 0) {
    // No merchant order numbers found, return returns with empty order data
    return returns.map((returnItem) => {
      const totalQuantity = returnItem.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0;

      return {
        _id: returnItem._id,
        orderID: null,
        quantity: totalQuantity,
        totalPrice: returnItem.totalPrice || null,
        customer: null,
        placedOn: returnItem.placedOn,
        email: null,
        phoneNumber: null,
        status: returnItem.status,
        platform: returnItem.platform,
      };
    });
  }

  const orderData = await Order.aggregate([
    {
      $match: { merchantOrderNo: { $in: merchantOrderNos } },
    },
    {
      $project: {
        orderId: 1,
        merchantOrderNo: 1,
        totalInclVat: 1,
        orderCustomer: 1,
      },
    },
  ]);

  const orderMap = {};
  orderData.forEach((order) => {
    orderMap[order.merchantOrderNo] = order;
  });

  const formattedReturns = returns.map((returnItem) => {
    const orderInfo = orderMap[returnItem.merchantOrderNo] || {};

    const customerName = orderInfo.orderCustomer
      ? `${orderInfo.orderCustomer.firstName || ''} ${orderInfo.orderCustomer.lastName || ''}`.trim()
      : '';

    // Calculate total quantity from products
    const totalQuantity = returnItem.products?.reduce((sum, product) => sum + (product.quantity || 0), 0) || 0;

    return {
      _id: returnItem._id,
      orderID: orderInfo.orderId || null,
      quantity: totalQuantity,
      totalPrice: orderInfo.totalInclVat || null,
      customer: customerName || null,
      placedOn: returnItem.placedOn,
      email: orderInfo.orderCustomer?.email || null,
      phoneNumber: orderInfo.orderCustomer?.phone || null,
      status: returnItem.status,
      platform: returnItem.platform,
    };
  });

  if (searchTerm && isNameOrEmailSearch(searchTerm)) {
    return formattedReturns.filter((returnItem) => returnItem.customer || returnItem.email || returnItem.orderID);
  }

  return formattedReturns;
};

export const sanitizeReturnData = (returnData) => {
  try {
    if (!returnData) {
      throw new Error('Return data is required');
    }

    const sanitizedData = {
      returnId: returnData.Id?.toString(),
      merchantReturnNo: returnData.MerchantReturnNo,
      merchantOrderNo: returnData.MerchantOrderNo,
      channelOrderNo: returnData.ChannelOrderNo,
      channelReturnNo: returnData.ChannelReturnNo,
      channelId: returnData.ChannelId,
      totalPrice: returnData.RefundInclVat || 0,
      placedOn: returnData.CreatedAt ? new Date(returnData.CreatedAt) : null,
      acknowledgeDate: returnData.AcknowledgedDate ? new Date(returnData.AcknowledgedDate) : null,
      status: returnData.Status,
      platform: returnData.ChannelName,
      products: Array.isArray(returnData.Lines)
        ? returnData.Lines.map((line) => ({
            productSkuCode: line.MerchantProductNo,
            quantity: line.Quantity || 0,
          }))
        : [],
    };

    return { success: true, data: sanitizedData };
  } catch (error) {
    console.error('Error sanitizing return data:', error.message);
    return {
      success: false,
      message: `Error sanitizing return data: ${error.message}`,
      error: error.message,
    };
  }
};

export const buildReturnAggregationPipeline = () => {
  return [
    {
      $lookup: {
        from: 'channelengineorders',
        localField: 'merchantOrderNo',
        foreignField: 'merchantOrderNo',
        as: 'orderData',
      },
    },
    {
      $addFields: {
        orderInfo: { $arrayElemAt: ['$orderData', 0] },
        totalQuantity: {
          $reduce: {
            input: '$products',
            initialValue: 0,
            in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        returnId: 1,
        merchantReturnNo: 1,
        merchantOrderNo: 1,
        channelOrderNo: 1,
        channelReturnNo: 1,
        channelId: 1,
        placedOn: 1,
        acknowledgeDate: 1,
        platform: 1,
        products: 1,
        status: 1,
        totalPrice: 1,
        totalQuantity: 1,
        createdAt: 1,
        updatedAt: 1,
        orderInfo: 1,
      },
    },
  ];
};

export const formatReturnDetails = (aggregatedResult) => {
  if (!aggregatedResult) {
    return null;
  }

  const returnData = aggregatedResult;
  const orderInfo = aggregatedResult.orderInfo;

  if (!orderInfo) {
    return {
      orderInfo: {
        returnId: returnData.returnId,
        merchantReturnNo: returnData.merchantReturnNo,
        status: returnData.status,
        placedOn: returnData.placedOn,
        acknowledgeDate: returnData.acknowledgeDate,
      },
      paymentInfo: {
        platform: returnData.platform || null,
        mode: null,
        amount: null,
        paidOn: returnData.placedOn || null,
        currencyCode: null,
      },
      customerInfo: {
        name: null,
        email: null,
        phone: null,
      },
      shippingAddress: null,
      items:
        returnData.products?.map((product) => ({
          productName: null,
          sku: product.productSkuCode,
          quantity: product.quantity,
          unitPrice: null,
          totalPrice: null,
        })) || [],
      priceBreakdown: {
        subtotal: null,
        shipping: null,
        taxes: null,
        total: null,
        currencyCode: null,
      },
    };
  }

  const returnedSkus = returnData.products || [];
  const orderSkus = orderInfo.orderSkuList?.skuList || [];

  const returnItems = returnedSkus.map((returnProduct) => {
    const matchingSku = orderSkus.find((sku) => sku.merchantProductNo === returnProduct.productSkuCode);

    return {
      productName: matchingSku?.description || 'Product',
      sku: returnProduct.productSkuCode,
      quantity: returnProduct.quantity,
      unitPrice: matchingSku?.unitPriceInclVat || 0,
      totalPrice: matchingSku ? matchingSku.unitPriceInclVat * returnProduct.quantity : 0,
    };
  });

  const totalQuantity = returnedSkus.reduce((sum, product) => sum + (product.quantity || 0), 0);
  const totalOrderQuantity = orderSkus.reduce((sum, sku) => sum + (sku.quantity || 0), 0);
  const returnProportion = totalOrderQuantity > 0 ? totalQuantity / totalOrderQuantity : 0;

  const subtotalExclVat = (orderInfo.subTotalExclVat || 0) * returnProportion;
  const subtotalVat = (orderInfo.subTotalVat || 0) * returnProportion;

  const shippingExclVat = (orderInfo.shippingCostsExclVat || 0) * returnProportion;
  const shippingVat = (orderInfo.shippingCostsVat || 0) * returnProportion;

  // Total taxes (VAT) for the return
  const totalTaxes = subtotalVat + shippingVat;

  // Calculate totals
  // Total (including VAT) = Subtotal (ExclVat) + Shipping (ExclVat) + Total Taxes
  const totalInclVat = subtotalExclVat + shippingExclVat + totalTaxes;

  return {
    orderInfo: {
      orderId: orderInfo.orderId,
      returnId: returnData.returnId,
      merchantReturnNo: returnData.merchantReturnNo,
      status: returnData.status,
      placedOn: returnData.placedOn,
      acknowledgeDate: returnData.acknowledgeDate,
    },
    paymentInfo: {
      platform: returnData.platform || orderInfo.channelName,
      mode: orderInfo.orderPaymentDetails?.paymentMethod || 'N/A',
      amount: totalInclVat,
      paidOn: orderInfo.orderDate,
      currencyCode: orderInfo.orderPaymentDetails?.currencyCode || 'SAR',
    },
    customerInfo: {
      name: orderInfo.orderCustomer
        ? `${orderInfo.orderCustomer.firstName || ''} ${orderInfo.orderCustomer.lastName || ''}`.trim()
        : null,
      email: orderInfo.orderCustomer?.email || null,
      phone: orderInfo.orderCustomer?.phone || null,
    },
    shippingAddress: orderInfo.orderShippingAddress
      ? {
          line1: orderInfo.orderShippingAddress.line1,
          line2: orderInfo.orderShippingAddress.line2,
          line3: orderInfo.orderShippingAddress.line3,
          streetName: orderInfo.orderShippingAddress.streetName,
          houseNr: orderInfo.orderShippingAddress.houseNr,
          houseNrAddition: orderInfo.orderShippingAddress.houseNrAddition,
          city: orderInfo.orderShippingAddress.city,
          region: orderInfo.orderShippingAddress.region,
          zipCode: orderInfo.orderShippingAddress.zipCode,
          countryIso: orderInfo.orderShippingAddress.countryIso,
          fullAddress: [
            orderInfo.orderShippingAddress.streetName,
            orderInfo.orderShippingAddress.city,
            orderInfo.orderShippingAddress.region,
            orderInfo.orderShippingAddress.countryIso,
            orderInfo.orderShippingAddress.zipCode,
          ]
            .filter(Boolean)
            .join(', '),
        }
      : null,
    items: returnItems,
    priceBreakdown: {
      subtotal: subtotalExclVat, // Subtotal BEFORE tax
      shipping: shippingExclVat, // Shipping BEFORE tax
      taxes: totalTaxes, // Total taxes (VAT)
      total: totalInclVat, // Total = subtotal + shipping + taxes
      currencyCode: orderInfo.orderPaymentDetails?.currencyCode || 'SAR',
    },
  };
};

export default {
  sanitizeReturnData,
  isNameOrEmailSearch,
  formatReturnWithOrderData,
  buildReturnAggregationPipeline,
  formatReturnDetails,
};
