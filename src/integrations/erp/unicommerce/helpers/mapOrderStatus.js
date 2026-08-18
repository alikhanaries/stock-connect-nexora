const mapOrderLevelStatus = (order) => {
  const status = order?.status;
  switch (status) {
    case 'NEW':
    case 'IN_PROGRESS':
      return 'CREATED';
    case 'SHIPPED':
    case 'CLOSED':
    case 'RETURNED':
      return 'COMPLETE';
    case 'CANCELED':
      return 'CANCELLED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'COMPLETE':
      return 'COMPLETE';
    default:
      return 'CREATED';
  }
};
const mapItemStatus = (item) => {
  switch ((item.status || '').toUpperCase()) {
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED';
    case 'DISPATCHED':
    case 'SHIPPED':
      return 'DISPATCHED';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'RETURN_REQUESTED':
      return 'RETURN_REQUESTED'; // CIR
    case 'COURIER_RETURN':
    case 'RETURNED':
      return 'COURIER_RETURN'; // RTO
    default:
      return 'CREATED';
  }
};

const mapAddress = (addr, customer) => ({
  addressLine1: addr?.line1 || '',
  addressLine2: '',
  city: addr?.city || '',
  country: addr?.countryIso?.toUpperCase() || '',
  email: customer?.email || '',
  name: `${addr?.firstName || ''} ${addr?.lastName || ''}`.trim(),
  phone: '',
  pincode: '',
  state: '',
});

export const mapOrderStatus = (order) => {
  const items = order.orderSkuList?.skuList || [];

  return {
    id: String(order._id),
    code: order.channelOrderNumber || String(order.orderId),
    orderDate: order.orderDate,
    orderStatus: mapOrderLevelStatus(order),
    sla: order.slaDate,
    priority: order.priority || 0,
    paymentType: order.paymentType,

    orderPrice: {
      currency: 'INR',
      totalCashOnDeliveryCharges: order.codCharges || 0,
      totalDiscount: order.discount || 0,
      totalGiftCharges: order.giftCharges || 0,
      totalPrepaidAmount: order.prepaidAmount || 0,
      totalShippingCharges: order.shippingCharges || 0,
    },

    orderItems: items.map((item) => ({
      orderItemId: String(item.id),
      status: mapItemStatus(item),
      productId: item.merchantProductNo,
      variantId: item.channelProductNo,
      sku: item.merchantProductNo,
      returnReason: '',
      returnDate: '',
      returnAWB: '',
      returnShippingProvider: '',
      returnId: '',
      courierStatus: '',
      returnDeliveryDate: '',
      title: item.description,
      shippingMethodCode: 'STD',

      orderItemPrice: {
        cashOnDeliveryCharges: 0,
        sellingPrice: item.unitPriceInclVat || 0,
        shippingCharges: 0,
        discount: 0,
        totalPrice: item.lineTotalInclVat || 0,
        transferPrice: 0,
        currency: 'INR',
      },

      quantity: item.quantity || 1,
      giftWrap: {
        giftWrapMessage: '',
        giftWrapCharges: 0,
      },

      onHold: false,
      packetNumber: 1,
    })),

    taxExempted: false,
    cFormProvided: false,
    thirdPartyShipping: true,
    shippingAddress: mapAddress(order.orderShippingAddress, order.orderCustomer),
    billingAddress: mapAddress(order.orderBillingAddress, order.orderCustomer),
    additionalInfo: '',
  };
};
