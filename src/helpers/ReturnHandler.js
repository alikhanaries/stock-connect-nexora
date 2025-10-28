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
            acceptedQuantity: line.AcceptedQuantity || 0,
            rejectedQuantity: line.RejectedQuantity || 0,
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

export const addStatusManipulationStages = () => {
  return [
    {
      $addFields: {
        totalAcceptedQuantity: {
          $sum: {
            $map: {
              input: '$products',
              as: 'p',
              in: { $ifNull: ['$$p.acceptedQuantity', 0] },
            },
          },
        },
        totalRejectedQuantity: {
          $sum: {
            $map: {
              input: '$products',
              as: 'p',
              in: { $ifNull: ['$$p.rejectedQuantity', 0] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $eq: ['$status', 'IN_PROGRESS'] },
                    { $eq: ['$totalAcceptedQuantity', 0] },
                    { $eq: ['$totalRejectedQuantity', 0] },
                  ],
                },
                then: 'RETURN_REQUESTED',
              },
              {
                case: {
                  $and: [{ $in: ['$status', ['IN_PROGRESS', 'RECEIVED']] }, { $gt: ['$totalAcceptedQuantity', 0] }],
                },
                then: 'REQUEST_ACCEPTED',
              },
              {
                case: {
                  $and: [{ $in: ['$status', ['IN_PROGRESS', 'RECEIVED']] }, { $gt: ['$totalRejectedQuantity', 0] }],
                },
                then: 'REQUEST_REJECTED',
              },
            ],
            default: '$status',
          },
        },
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
      _id: returnData._id,
      returnId: returnData.returnId || null,
      orderId: null,
      paymentInfo: {
        channelName: returnData.platform || null,
        paymentMethod: null,
        currencyCode: null,
      },
      customerInfo: {
        name: null,
        email: null,
        phoneNo: null,
      },
      shippingAddress: {
        address: null,
        city: null,
        region: null,
        zipCode: null,
      },
      status: returnData.status || null,
      subtotal: 0,
      tax: 0,
      total: 0,
      shippingFee: 0,
      shippedItems: [],
      unshippedItems:
        returnData.products?.map((product, index) => ({
          id: index + 1,
          merchantProductNo: product.productSkuCode,
          channelProductNo: null,
          name: 'Product',
          imageUrl: null,
          unitPriceInclVat: 0,
          unitPriceExclVat: 0,
          unitVat: 0,
          lineTotalInclVat: 0,
          lineTotalExclVat: 0,
          lineVat: 0,
          quantity: product.quantity || 0,
        })) || [],
    };
  }

  const returnedSkus = returnData.products || [];
  const orderSkus = orderInfo.orderSkuList?.skuList || [];

  // Calculate shipping and total quantities
  const totalReturnQuantity = returnedSkus.reduce((sum, product) => sum + (product.quantity || 0), 0);
  const totalOrderQuantity = orderSkus.reduce((sum, sku) => sum + (sku.quantity || 0), 0);
  const returnProportion = totalOrderQuantity > 0 ? totalReturnQuantity / totalOrderQuantity : 0;

  // Calculate proportional costs
  const proportionalSubtotalExclVat = (orderInfo.subTotalExclVat || 0) * returnProportion;
  const proportionalSubtotalVat = (orderInfo.subTotalVat || 0) * returnProportion;
  const proportionalShippingExclVat = (orderInfo.shippingCostsExclVat || 0) * returnProportion;
  const proportionalShippingVat = (orderInfo.shippingCostsVat || 0) * returnProportion;

  // Calculate totals
  const subtotal = proportionalSubtotalExclVat;
  const tax = proportionalSubtotalVat + proportionalShippingVat;
  const shippingFee = proportionalShippingExclVat;
  const total = subtotal + tax + shippingFee;

  // Map returned items to unshipped format
  const unshippedItems = returnedSkus.map((returnProduct, index) => {
    const matchingSku = orderSkus.find((sku) => sku.merchantProductNo === returnProduct.productSkuCode);

    const unitPriceExclVat = matchingSku?.unitPriceExclVat || 0;
    const unitVat = matchingSku?.unitVat || 0;
    const unitPriceInclVat = unitPriceExclVat + unitVat;
    const quantity = returnProduct.quantity || 0;

    return {
      id: index + 1,
      merchantProductNo: returnProduct.productSkuCode,
      channelProductNo: matchingSku?.channelProductNo || null,
      name: matchingSku?.description || 'Product',
      imageUrl: null,
      unitPriceInclVat: unitPriceInclVat,
      unitPriceExclVat: unitPriceExclVat,
      unitVat: unitVat,
      lineTotalInclVat: unitPriceInclVat * quantity,
      lineTotalExclVat: unitPriceExclVat * quantity,
      lineVat: unitVat * quantity,
      quantity: quantity,
    };
  });

  // Build shipping address
  const shippingAddress = orderInfo.orderShippingAddress
    ? {
        address: [
          orderInfo.orderShippingAddress.line1,
          orderInfo.orderShippingAddress.line2,
          orderInfo.orderShippingAddress.line3,
          orderInfo.orderShippingAddress.streetName,
          orderInfo.orderShippingAddress.houseNr,
          orderInfo.orderShippingAddress.houseNrAddition,
        ]
          .filter(Boolean)
          .join(' '),
        city: orderInfo.orderShippingAddress.city || '',
        region: orderInfo.orderShippingAddress.region || '',
        zipCode: orderInfo.orderShippingAddress.zipCode || '',
      }
    : {
        address: '',
        city: '',
        region: '',
        zipCode: '',
      };

  return {
    _id: returnData._id,
    returnId: returnData.returnId || null,
    orderId: orderInfo.orderId || null,
    paymentInfo: {
      channelName: returnData.platform || orderInfo.channelName || null,
      paymentMethod: orderInfo.orderPaymentDetails?.paymentMethod || null,
      currencyCode: orderInfo.orderPaymentDetails?.currencyCode || 'SAR',
    },
    customerInfo: {
      name: orderInfo.orderCustomer
        ? `${orderInfo.orderCustomer.firstName || ''} ${orderInfo.orderCustomer.lastName || ''}`.trim() || null
        : null,
      email: orderInfo.orderCustomer?.email || null,
      phoneNo: orderInfo.orderCustomer?.phone || null,
    },
    shippingAddress: shippingAddress,
    status: returnData.status || 'UNKNOWN',
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    shippingFee: parseFloat(shippingFee.toFixed(2)),
    shippedItems: [],
    unshippedItems: unshippedItems,
  };
};

export default {
  sanitizeReturnData,
  isNameOrEmailSearch,
  formatReturnWithOrderData,
  buildReturnAggregationPipeline,
  addStatusManipulationStages,
  formatReturnDetails,
};
