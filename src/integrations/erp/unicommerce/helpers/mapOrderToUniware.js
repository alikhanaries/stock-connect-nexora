import { config } from '#root/src/config/config.js';

const { STOCK_LOCATION } = config;

const isEmpty = (value) => value === undefined || value === null || value === '';

// Recursively omits fields with empty values (undefined/null/''); numeric 0 is kept.
// Keys listed in `keep` are always retained even when empty (mandatory fields).
const pruneEmpty = (value, keep = []) => {
  if (Array.isArray(value)) return value.map((item) => pruneEmpty(item, keep));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [key, pruneEmpty(val, keep)])
        .filter(([key, val]) => keep.includes(key) || !isEmpty(val))
    );
  }
  return value;
};

const mapOrderToUniware = (order, productIdBySku = new Map()) => {
  const currency = order?.orderPaymentDetails?.currencyCode?.toUpperCase() || 'INR';

  return pruneEmpty(
    {
      id: String(order._id),
      code: order.channelOrderNumber || String(order.orderId),
      orderDate: order.orderDate,
      orderStatus: 'CREATED',
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
        status: 'CREATED',
        productId: String(productIdBySku.get(item.merchantProductNo) || item.channelProductNo || ''),
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

        onHold: false,
        packetNumber: index + 1,
        facilityCode: STOCK_LOCATION,
      })),

      taxExempted: false,
      cFormProvided: false,
      thirdPartyShipping: true,

      shippingAddress: {
        addressLine1: order.orderShippingAddress?.line1 || '',
        addressLine2: '',
        city: order.orderShippingAddress?.city || '',
        country: order.orderShippingAddress?.countryIso || '',
        email: order.orderCustomer?.email || '',
        name: `${order.orderShippingAddress?.firstName || ''} ${order.orderShippingAddress?.lastName || ''}`.trim(),
        phone: order.orderCustomer?.phone || '',
        pincode: order.orderShippingAddress?.zipCode || '',
        state: order.orderShippingAddress?.region || '',
      },

      billingAddress: {
        addressLine1: order.orderBillingAddress?.line1 || '',
        addressLine2: '',
        city: order.orderBillingAddress?.city || '',
        country: order.orderBillingAddress?.countryIso || '',
        email: order.orderCustomer?.email || '',
        name: `${order.orderBillingAddress?.firstName || ''} ${order.orderBillingAddress?.lastName || ''}`.trim(),
        phone: order.orderCustomer?.phone || '',
        pincode: order.orderBillingAddress?.zipCode || '',
        state: order.orderBillingAddress?.region || '',
      },

      gstin: '',
      additionalInfo: '',
    },
    ['phone', 'pincode', 'state', 'returnReason', 'returnDate', 'returnAWB', 'returnShippingProvider']
  );
};

export default mapOrderToUniware;
