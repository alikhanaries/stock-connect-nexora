import { convertFromSar } from '#root/src/integrations/common/helpers/currencyConverter.js';
import { sentosConfig } from '../config/config.js';

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '905000000000';
  if (digits.length >= 11) return digits.slice(0, 13);
  return digits.padStart(11, '0');
};

const formatOrderDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const mapAddress = (source = {}, fallbackName = 'NA') => ({
  name: source.name || fallbackName,
  phone: formatPhone(source.phone),
  address: source.address || source.Line1 || source.StreetName || 'NA',
  country: source.country || source.CountryIso || 'Saudi Arabia',
  city: source.city || source.City || source.Region || 'NA',
  district: source.district || source.Region || source.Line2 || 'NA',
  zipCode: Number(source.zipCode || source.ZipCode) || 0,
});

export const mapOrderToSentos = async (order = {}) => {
  const billing = order.BillingAddress || {};
  const shipping = order.ShippingAddress || {};
  const customerName = [billing.FirstName, billing.LastName].filter(Boolean).join(' ') || 'Customer';

  const lines = await Promise.all(
    (order.Lines || []).map(async (line) => {
      const sarPrice = Number(line.UnitPriceInclVat || line.UnitPrice || 0);
      const tryPrice = sarPrice > 0 ? await convertFromSar('TRY', sarPrice) : 0;

      return {
        warehouse_id: sentosConfig.SENTOS_WAREHOUSE_ID,
        quantity: Number(line.Quantity) || 1,
        sku: String(line.MerchantProductNo || ''),
        name: line.Description || line.MerchantProductNo || 'Product',
        price: Number(tryPrice.toFixed(2)),
        vat_rate: 20,
      };
    })
  );

  return {
    order_id: String(order.Id),
    order_code: String(order.ChannelOrderNo || order.Id),
    status: 2,
    channel_id: sentosConfig.SENTOS_ORDER_CHANNEL_ID,
    order_date: formatOrderDate(order.OrderDate),
    currency: 'TL',
    payment_method: 'CREDIT_CARD',
    customer: {
      name: customerName,
      phone: formatPhone(order.Phone || billing.Phone || shipping.Phone),
      mail_address: order.Email || billing.Email || 'no-reply@stockconnect.local',
    },
    invoice_address: mapAddress(
      {
        name: customerName,
        phone: billing.Phone || order.Phone,
        address: billing.Line1 || billing.StreetName,
        city: billing.City,
        district: billing.Region,
        country: billing.CountryIso || 'Saudi Arabia',
        zipCode: billing.ZipCode,
      },
      customerName
    ),
    shipment_address: mapAddress(
      {
        name: [shipping.FirstName, shipping.LastName].filter(Boolean).join(' ') || customerName,
        phone: shipping.Phone || billing.Phone || order.Phone,
        address: shipping.Line1 || shipping.StreetName || billing.Line1,
        city: shipping.City || billing.City,
        district: shipping.Region || billing.Region,
        country: shipping.CountryIso || billing.CountryIso || 'Saudi Arabia',
        zipCode: shipping.ZipCode || billing.ZipCode,
      },
      customerName
    ),
    lines,
  };
};
