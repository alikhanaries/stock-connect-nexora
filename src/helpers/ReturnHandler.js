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

  // Format returns with matched order data
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
      channelId: returnData.ChannelId,
      totalPrice: returnData.RefundInclVat || 0,
      placedOn: returnData.ReturnDate ? new Date(returnData.ReturnDate) : null,
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

export default {
  sanitizeReturnData,
  isNameOrEmailSearch,
  formatReturnWithOrderData,
};
