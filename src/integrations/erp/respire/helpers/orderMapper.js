import { formatRespireDate, formatRespireProductCode } from './commonHelper.js';
import { convertSarToTry } from '#root/src/integrations/common/helpers/currencyConverter.js';

export const mapOrderToRespire = async (order) => {
  const billing = order.BillingAddress || order.orderBillingAddress || {};
  const shipping = order.ShippingAddress || order.orderShippingAddress || {};

  const billingFullName =
    [billing.FirstName || billing.firstName, billing.LastName || billing.lastName].filter(Boolean).join(' ') || 'NA';
  const shippingFullName =
    [shipping.FirstName || shipping.firstName, shipping.LastName || shipping.lastName].filter(Boolean).join(' ') ||
    billingFullName;

  const toPhone = (val) => Number(String(val || '').replace(/\D/g, '')) || 0;

  const phone = toPhone(
    order.Phone || order.orderCustomer?.phone || billing.Phone || billing.phone || shipping.Phone || shipping.phone
  );
  const billingPhone = toPhone(billing.Phone || billing.phone || phone);
  const shippingPhone = toPhone(shipping.Phone || shipping.phone || phone);

  const lines = order.Lines || order.orderSkuList?.skuList || [];
  const orderDetails = await Promise.all(
    lines.map(async (line) => ({
      product_code: formatRespireProductCode(line.MerchantProductNo || line.merchantProductNo || line.channelProductNo),
      price: await convertSarToTry(line.UnitPriceInclVat ?? line.unitPriceInclVat ?? 0),
      quantity: line.Quantity ?? line.quantity ?? 1,
    }))
  );

  return {
    supplier: 'Manual',
    order_id: String(order.Id || order.orderId || order.channelOrderNumber || order.merchantOrderNo),
    company: billingFullName,
    full_name: billingFullName,
    email: order.Email || order.orderCustomer?.email || billing.Email || billing.email || 'NA',
    mobile_phone: billingPhone,
    phone: shippingPhone,
    invoice_address: billing.Line1 || billing.line1 || billing.StreetName || billing.streetName || 'NA',
    invoice_city: billing.City || billing.city || billing.Region || billing.region || 'NA',
    invoice_district: billing.Region || billing.region || billing.Line2 || billing.line2 || 'NA',
    invoice_fullname: billingFullName,
    invoice_postcode: Number(billing.ZipCode || billing.zipCode) || 0,
    invoice_tel: billingPhone,
    invoice_gsm: billingPhone,
    ship_address:
      shipping.Line1 ||
      shipping.line1 ||
      shipping.StreetName ||
      shipping.streetName ||
      billing.Line1 ||
      billing.line1 ||
      'NA',
    ship_city:
      shipping.City || shipping.city || shipping.Region || shipping.region || billing.City || billing.city || 'NA',
    ship_district:
      shipping.Region ||
      shipping.region ||
      shipping.Line2 ||
      shipping.line2 ||
      billing.Region ||
      billing.region ||
      'NA',
    ship_fullname: shippingFullName,
    ship_postcode: Number(shipping.ZipCode || shipping.zipCode || billing.ZipCode || billing.zipCode) || 0,
    ship_tel: shippingPhone,
    ship_gsm: shippingPhone,
    tax_office: billing.City || billing.city || 'NA',
    order_date: formatRespireDate(order.OrderDate || order.orderDate),
    discount: 0,
    cargo_code: order.CargoCode || order.cargoCode || 'NA',
    payment_type: order.PaymentMethod || order.orderPaymentDetails?.paymentMethod || 'NA',
    cargo: order.Cargo || order.cargo || 'NA',
    cargo_payment_method: order.CargoPaymentMethod || order.cargoPaymentMethod || 'NA',
    bank: order.Bank || order.bank || 'NA',
    installment: 0,
    order_details: orderDetails,
  };
};
