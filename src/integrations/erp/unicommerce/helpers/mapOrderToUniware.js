const mapOrderToUniware = (order) => {
  const currency = order?.orderPaymentDetails?.currencyCode?.toUpperCase() || 'INR';

  return {
    id: String(order._id),
    code: order.channelOrderNumber || String(order.orderId),
    orderDate: order.orderDate,
    orderStatus: order.status === 'CREATED' ? 'CREATED' : 'PENDING_VERIFICATION',
    sla: new Date(new Date(order.orderDate).getTime() + 2 * 24 * 60 * 60 * 1000),
    priority: 0,
    paymentType: 'PREPAID',

    orderPrice: {
      currency,
      totalCashOnDeliveryCharges: 0,
      totalDiscount: 0,
      totalGiftCharges: 0,
      totalStoreCredit: 0,
      totalPrepaidAmount: order.totalInclVat || 0,
      totalShippingCharges: order.shippingCostsInclVat || 0,
    },

    orderItems: (order.orderSkuList?.skuList || []).map((item, index) => ({
      orderItemId: String(item.id),
      status: item.status === 'CREATED' ? 'CREATED' : 'PENDING_VERIFICATION',
      productId: item.channelProductNo || '',
      variantId: item.merchantProductNo || '',
      sku: item.merchantProductNo || '',
      returnReason: '',
      returnDate: '',
      returnAWB: '',
      returnShippingProvider: '',
      title: item.description || '',
      shippingMethodCode: 'STD',
      orderItemPrice: {
        cashOnDeliveryCharges: 0,
        sellingPrice: item.unitPriceInclVat || 0,
        shippingCharges: 0,
        discount: 0,
        totalPrice: item.lineTotalInclVat || 0,
        transferPrice: item.unitPriceExclVat || 0,
        currency,
      },

      quantity: item.quantity || 1,

      giftWrap: {
        giftWrapMessage: '',
        giftWrapCharges: 0,
      },

      onHold: false,
      packetNumber: index + 1,
      facilityCode: item.stockLocation?.name || '',
    })),

    taxExempted: false,
    cFormProvided: false,
    thirdPartyShipping: false,

    shippingAddress: {
      addressLine1: order.orderShippingAddress?.line1 || '',
      addressLine2: '',
      city: order.orderShippingAddress?.city || '',
      country: order.orderShippingAddress?.countryIso || '',
      email: order.orderCustomer?.email || '',
      name: `${order.orderShippingAddress?.firstName || ''} ${order.orderShippingAddress?.lastName || ''}`.trim(),
      phone: '',
      pincode: '',
      state: '',
    },

    billingAddress: {
      addressLine1: order.orderBillingAddress?.line1 || '',
      addressLine2: '',
      city: order.orderBillingAddress?.city || '',
      country: order.orderBillingAddress?.countryIso || '',
      email: order.orderCustomer?.email || '',
      name: `${order.orderBillingAddress?.firstName || ''} ${order.orderBillingAddress?.lastName || ''}`.trim(),
      phone: '',
      pincode: '',
      state: '',
    },

    gstin: '',
    additionalInfo: '',
  };
};

export default mapOrderToUniware;
