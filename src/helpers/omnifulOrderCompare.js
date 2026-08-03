/**
 * Compare StockConnect create payload, MongoDB shipment, and OmniFul GET order response.
 */
import { config } from '../config/config.js';

const fmt = (value) => {
  if (value === undefined) return '(undefined)';
  if (value === null) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const numClose = (a, b, tolerance = 0.01) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= tolerance;
};

/**
 * @param {string} label
 * @param {unknown} sent
 * @param {unknown} stored
 * @param {{ tolerance?: number }} [opts]
 */
const diffLine = (label, sent, stored, opts = {}) => {
  const match =
    typeof sent === 'number' || typeof stored === 'number'
      ? numClose(sent, stored, opts.tolerance)
      : fmt(sent) === fmt(stored);

  return {
    field: label,
    sent,
    stored,
    match,
    note: match ? 'match' : sent == null || sent === 0 ? 'possibly ignored (sent empty/zero)' : 'changed or mismatched',
  };
};

/**
 * Reconstruct the create-order payload shape from shipment + order (approximates what POST /orders sent).
 * @param {Object} shipment
 * @param {Object|null} order
 */
export const reconstructCreateOrderPayload = (shipment, order) => {
  const products = shipment?.products || [];
  return {
    order_id: shipment?._id?.toString(),
    hub_code: config.OMNIFUL_HUB_CODE || '(from env)',
    order_items: products.map((item) => ({
      sku_code: item.merchantProductNo,
      name:
        order?.orderSkuList?.skuList?.find((s) => s.merchantProductNo === item.merchantProductNo)?.description ||
        'Unknown Product',
      selling_price: item.originalLineTotalInclVat || 0,
      quantity: item.quantity || 0,
    })),
    billing_address: order?.orderBillingAddress
      ? {
          address1: order.orderBillingAddress.line1,
          city: order.orderBillingAddress.city,
          country: order.orderBillingAddress.countryIso,
        }
      : null,
    shipping_address: order?.orderShippingAddress
      ? {
          address1: order.orderShippingAddress.line1,
          city: order.orderShippingAddress.city,
          country: order.orderShippingAddress.countryIso,
        }
      : null,
    invoice: {
      currency: order?.orderPaymentDetails?.currencyCode,
      total: products.reduce((sum, p) => sum + (p.lineTotalInclVat || 0), 0),
    },
    customer: order?.orderCustomer
      ? {
          id: order.orderCustomer.orderId,
          first_name: order.orderCustomer.firstName,
        }
      : null,
    payment_method: 'prepaid',
    is_cash_on_delivery: false,
    type: 'b2b',
  };
};

/**
 * @param {Object} options
 * @param {Object} [options.createPayload] - Original or reconstructed POST /orders body
 * @param {Object} options.shipment - MongoDB shipment document
 * @param {Object} options.getOrderResponse - Parsed GET response (full body or data object)
 * @returns {Object}
 */
export const compareOmnifulOrderData = ({ createPayload, shipment, getOrderResponse }) => {
  const stored = getOrderResponse?.data ?? getOrderResponse;
  const rows = [];
  const sections = { ignored: [], changed: [], added: [], matched: [] };

  if (!stored) {
    return { error: 'GET response has no data', rows: [], sections };
  }

  // --- Order identifiers ---
  rows.push(
    diffLine('order_id (external)', createPayload?.order_id, stored.order_id),
    diffLine('omniful_order_id (internal)', shipment?.omniful?.omnifulId, stored.omniful_order_id || stored.id)
  );

  // --- Invoice ---
  const sentInvoice = createPayload?.invoice || {};
  const storedInvoice = stored.invoice || {};

  for (const key of ['currency', 'subtotal', 'sub_total', 'shipping_price', 'tax', 'discount', 'total', 'total_paid']) {
    const sentVal = sentInvoice[key];
    const storedVal = storedInvoice[key] ?? storedInvoice[key === 'sub_total' ? 'subtotal' : key];
    if (sentVal !== undefined || storedVal !== undefined) {
      rows.push(diffLine(`invoice.${key}`, sentVal, storedVal));
    }
  }

  if (sentInvoice.total !== undefined && storedInvoice.subtotal === undefined && storedInvoice.total === 0) {
    sections.ignored.push('invoice.total may have been ignored or stored as 0');
  }
  if (sentInvoice.subtotal === undefined && sentInvoice.sub_total === undefined && storedInvoice.subtotal != null) {
    sections.added.push(`invoice.subtotal=${storedInvoice.subtotal} (computed by OmniFul)`);
  }

  // --- Items ---
  const sentItems = createPayload?.order_items || [];
  const storedItems = stored.order_items || [];

  const maxLen = Math.max(sentItems.length, storedItems.length);
  for (let i = 0; i < maxLen; i++) {
    const sent = sentItems[i];
    const got = storedItems[i];
    const prefix = `order_items[${i}]`;

    if (!sent && got) {
      sections.added.push(`${prefix} added by OmniFul: sku=${got.sku_code}`);
      continue;
    }
    if (sent && !got) {
      sections.ignored.push(`${prefix} not returned in GET response`);
      continue;
    }

    for (const field of ['sku_code', 'quantity', 'selling_price', 'unit_price', 'subtotal', 'total', 'tax']) {
      rows.push(diffLine(`${prefix}.${field}`, sent?.[field], got?.[field]));
    }

    if (sent?.selling_price && got?.unit_price && numClose(sent.selling_price, got.unit_price)) {
      sections.matched.push(`${prefix}: selling_price sent matches stored unit_price (unit price semantics)`);
    } else if (sent?.selling_price && got?.total && numClose(sent.selling_price, got.total)) {
      sections.matched.push(`${prefix}: selling_price sent matches stored total (line total semantics)`);
    }
  }

  // --- Customer & addresses ---
  rows.push(
    diffLine('customer.first_name', createPayload?.customer?.first_name, stored.customer?.first_name),
    diffLine('shipping_address.city', createPayload?.shipping_address?.city, stored.shipping_address?.city),
    diffLine('billing_address.city', createPayload?.billing_address?.city, stored.billing_address?.city),
    diffLine('payment_method', createPayload?.payment_method, stored.payment_method)
  );

  for (const row of rows) {
    if (row.match) sections.matched.push(row.field);
    else if (row.sent == null || row.sent === '' || row.sent === 0)
      sections.ignored.push(`${row.field}: sent=${fmt(row.sent)} → stored=${fmt(row.stored)}`);
    else sections.changed.push(`${row.field}: sent=${fmt(row.sent)} → stored=${fmt(row.stored)}`);
  }

  return { rows, sections, stored };
};

/**
 * Print human-readable comparison report to stdout.
 * @param {ReturnType<typeof compareOmnifulOrderData>} comparison
 */
export const printOmnifulOrderComparison = (comparison) => {
  console.log('\n========== OmniFul Order Comparison ==========\n');

  if (comparison.error) {
    console.log('ERROR:', comparison.error);
    return;
  }

  console.log('--- Field diffs ---');
  for (const row of comparison.rows) {
    const icon = row.match ? '✓' : '✗';
    console.log(`${icon} ${row.field}`);
    console.log(`    sent:   ${fmt(row.sent)}`);
    console.log(`    stored: ${fmt(row.stored)}`);
    if (!row.match) console.log(`    note:   ${row.note}`);
  }

  console.log('\n--- Summary ---');
  console.log('Matched:', comparison.sections.matched.length ? comparison.sections.matched.join(', ') : '(none)');
  console.log(
    'Changed:',
    comparison.sections.changed.length ? comparison.sections.changed.join('\n         ') : '(none)'
  );
  console.log(
    'Ignored:',
    comparison.sections.ignored.length ? comparison.sections.ignored.join('\n         ') : '(none)'
  );
  console.log(
    'Added by OmniFul:',
    comparison.sections.added.length ? comparison.sections.added.join('\n         ') : '(none)'
  );
  console.log('\n============================================\n');
};
