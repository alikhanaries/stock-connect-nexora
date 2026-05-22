import { entegraConfig } from '#root/src/integrations/erp/entegra/config/config.js';
import { getAccessToken } from '../utils/accessTokenGenerator.js';

const formatEntegraDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const mapOrderToEntegra = (order) => {
  const billing = order.BillingAddress || {};
  const shipping = order.ShippingAddress || {};

  const billingFullName = [billing.FirstName, billing.LastName].filter(Boolean).join(' ') || 'NA';
  const shippingFullName = [shipping.FirstName, shipping.LastName].filter(Boolean).join(' ') || billingFullName;

  const toPhone = (val) => Number(String(val || '').replace(/\D/g, '')) || 0;

  const phone = toPhone(order.Phone || billing.Phone || shipping.Phone);
  const billingPhone = toPhone(billing.Phone || phone);
  const shippingPhone = toPhone(shipping.Phone || phone);

  const orderDetails = (order.Lines || []).map((line) => ({
    product_code: line.MerchantProductNo,
    price: line.UnitPriceInclVat ?? 0,
    quantity: line.Quantity ?? 1,
  }));

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

export const createEntegraOrder = async (orders = []) => {
  if (!orders.length) return;

  const authToken = await getAccessToken();
  const url = `${entegraConfig.ENTEGRA_BASE_URL}order/`;

  let successCount = 0;
  let failCount = 0;

  const MAX_RETRIES = 5;

  for (const order of orders) {
    const mapped = mapOrderToEntegra(order);
    console.log('mapped', mapped);
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ list: [mapped] }),
        });

        const data = await response.json();

        if (!response.ok) {
          lastError = `status=${response.status} | error: ${JSON.stringify(data)}`;
          console.warn(`[Entegra] attempt ${attempt}/${MAX_RETRIES} FAILED order_id=${order.Id} | ${lastError}`);
          continue;
        }

        successCount++;
        const entegraId = data?.id ?? data?.order_id ?? data?.data?.id ?? JSON.stringify(data);
        console.log(`[Entegra] SUCCESS order_id=${order.Id} | entegra_id=${entegraId} | attempt=${attempt}`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err.message;
        console.warn(
          `[Entegra] attempt ${attempt}/${MAX_RETRIES} FAILED order_id=${order.Id} | exception: ${err.message}`
        );
      }
    }

    if (lastError) {
      failCount++;
      console.error(`[Entegra] GAVE UP order_id=${order.Id} after ${MAX_RETRIES} attempts | last error: ${lastError}`);
    }
  }

  console.log(
    `[Entegra] Order push complete — success: ${successCount}, failed: ${failCount}, total: ${orders.length}`
  );
};
