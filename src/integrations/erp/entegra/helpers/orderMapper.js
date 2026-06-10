import { formatEntegraDate, formatEntegraProductCode } from './commonHelper.js';
import { convertSarToTry } from '#root/src/integrations/common/helpers/currencyConverter.js';

export const mapOrderToEntegra = async (order) => {
  const billing = order.BillingAddress || {};
  const shipping = order.ShippingAddress || {};

  const billingFullName = [billing.FirstName, billing.LastName].filter(Boolean).join(' ') || 'NA';
  const shippingFullName = [shipping.FirstName, shipping.LastName].filter(Boolean).join(' ') || billingFullName;

  const toPhone = (val) => Number(String(val || '').replace(/\D/g, '')) || 0;

  const phone = toPhone(order.Phone || billing.Phone || shipping.Phone);
  const billingPhone = toPhone(billing.Phone || phone);
  const shippingPhone = toPhone(shipping.Phone || phone);

  const orderDetails = await Promise.all(
    (order.Lines || []).map(async (line) => ({
      product_code: formatEntegraProductCode(line.MerchantProductNo),
      price: await convertSarToTry(line.UnitPriceInclVat ?? 0),
      quantity: line.Quantity ?? 1,
    }))
  );

  return {
    supplier: 'Manual',
    order_id: String(order.Id),
    company: billingFullName,
    full_name: billingFullName,
    email: order.Email || billing.Email || 'NA',
    mobile_phone: billingPhone,
    phone: shippingPhone,
    invoice_address: billing.Line1 || billing.StreetName || 'NA',
    invoice_city: billing.City || billing.Region || 'NA',
    invoice_district: billing.Region || billing.Line2 || 'NA',
    invoice_fullname: billingFullName,
    invoice_postcode: Number(billing.ZipCode) || 0,
    invoice_tel: billingPhone,
    invoice_gsm: billingPhone,
    ship_address: shipping.Line1 || shipping.StreetName || billing.Line1 || 'NA',
    ship_city: shipping.City || shipping.Region || billing.City || 'NA',
    ship_district: shipping.Region || shipping.Line2 || billing.Region || 'NA',
    ship_fullname: shippingFullName,
    ship_postcode: Number(shipping.ZipCode || billing.ZipCode) || 0,
    ship_tel: shippingPhone,
    ship_gsm: shippingPhone,
    tax_office: billing.City || 'NA',
    order_date: formatEntegraDate(order.OrderDate),
    discount: 0,
    cargo_code: order.CargoCode || 'NA',
    payment_type: order.PaymentMethod || 'NA',
    cargo: order.Cargo || 'NA',
    cargo_payment_method: order.CargoPaymentMethod || 'NA',
    bank: order.Bank || 'NA',
    installment: 0,
    order_details: orderDetails,
  };
};
