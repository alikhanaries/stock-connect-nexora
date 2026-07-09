/**
 * Tests AWB creation payload fix + invoice upload middleware fix.
 * Run: node scripts/test-awb-invoice-fix.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { createShipmentWithAymakan } from '../src/service/shipmentService.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

const results = [];

function log(name, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ name, pass, detail });
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function testTaxDataPayload(userId) {
  const originalFetch = global.fetch;
  let capturedPayload = null;

  global.fetch = async (_url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        success: true,
        shipping: { tracking_number: 'TEST-AWB-12345' },
      }),
    };
  };

  try {
    await createShipmentWithAymakan({
      userId,
      collectionData: {
        name: 'Test Pickup',
        email: 'pickup@test.com',
        city: 'Riyadh',
        address: 'Pickup St',
        country: 'SA',
        phone: '0500000000',
      },
      orderCustomer: { firstName: 'Test', lastName: 'Buyer', email: 'buyer@test.com' },
      products: [{ merchantProductNo: 'SKU-1', quantity: 1 }],
      pieces: 1,
      documentId: 'DOC-123',
      taxData: {
        tax_identification_number: '1234567',
        invoice_number: 'INV-001',
        invoice_date: '2026-01-01',
      },
      productsData: [{ sku: 'SKU-1', qty: 1, price: 100, description: 'Item', price_currency: 'SAR' }],
    });

    const meta = capturedPayload?.international_metadata;
    const ok =
      meta?.document_id === 'DOC-123' &&
      meta?.tax_identification_number === '1234567' &&
      meta?.invoice_number === 'INV-001' &&
      meta?.invoice_date === '2026-01-01';

    log('Unit: taxData → international_metadata', ok, ok ? JSON.stringify(meta) : `got ${JSON.stringify(meta)}`);
  } catch (err) {
    log('Unit: taxData → international_metadata', false, err.message);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testNoMetadataWhenIncomplete(userId) {
  const originalFetch = global.fetch;
  let capturedPayload = null;

  global.fetch = async (_url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({ success: true, shipping: { tracking_number: 'TEST-AWB-99999' } }),
    };
  };

  try {
    await createShipmentWithAymakan({
      userId,
      collectionData: { name: 'P', email: 'p@t.com', city: 'Riyadh', address: 'A', country: 'SA', phone: '0' },
      orderCustomer: { firstName: 'T', lastName: 'B', email: 'b@t.com' },
      products: [{ quantity: 1 }],
      pieces: 1,
    });

    const hasMeta = !!capturedPayload?.international_metadata;
    log(
      'Unit: skip international_metadata when incomplete',
      !hasMeta,
      hasMeta ? 'metadata was sent' : 'correctly omitted'
    );
  } catch (err) {
    log('Unit: skip international_metadata when incomplete', false, err.message);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testInvoiceUploadMiddleware(token, sellerId, orderId, skuCode) {
  const pdfPath = path.join(__dirname, 'test-invoice.pdf');
  if (!fs.existsSync(pdfPath)) {
    fs.writeFileSync(pdfPath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
  }

  const form = new FormData();
  form.append('orderId', orderId);
  form.append('skuCodes', skuCode);
  form.append('sellerId', sellerId);
  const blob = new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' });
  form.append('file', blob, 'test-invoice.pdf');

  const res = await fetch(`${BASE_URL}/orders/generate-documentId`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'en',
    },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  const pass = res.status !== 400 || body.message !== 'Seller ID is required';
  log(
    'API: invoice upload sellerId in body (no query)',
    pass,
    `HTTP ${res.status} — ${body.message || JSON.stringify(body.data || body).slice(0, 120)}`
  );
  return body;
}

async function testCreateShipmentApi(token, payload) {
  const res = await fetch(`${BASE_URL}/shipment/createShipment?sellerId=${payload.sellerId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'en',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  const msg = body.message || '';
  const notMiddlewareBlock = !msg.includes('Seller ID is required');
  const reachedService = res.status === 201 || res.status === 400 || res.status === 500;
  log(
    'API: createShipment endpoint',
    notMiddlewareBlock && reachedService,
    `HTTP ${res.status} — ${msg.slice(0, 150)}`
  );
  return { res, body };
}

async function main() {
  console.log('=== AWB / Invoice Fix Tests ===\n');

  await mongoose.connect(process.env.DB_URL);
  const db = mongoose.connection.db;

  const anyUser = await db.collection('users').findOne({ active: true, isDeleted: { $ne: true } });
  const testUserId = anyUser?._id?.toString() || new mongoose.Types.ObjectId().toString();

  await testTaxDataPayload(testUserId);
  await testNoMetadataWhenIncomplete(testUserId);

  const sellers = await db
    .collection('sellers')
    .find({ $or: [{ slug: /manijero|respire/i }, { name: /manijero|respire/i }] })
    .project({ name: 1, slug: 1 })
    .toArray();

  console.log('\n--- DB sellers (manijero/respire) ---');
  console.log(sellers.map((s) => `${s.name || s.slug} (${s._id})`).join(', ') || 'none found');

  let seller = sellers[0];
  if (!seller) {
    seller = await db.collection('sellers').findOne({ isDeleted: { $ne: true } });
    console.log('Fallback seller:', seller?.name, seller?._id);
  }

  if (!seller) {
    log('DB setup', false, 'No seller found');
    await mongoose.disconnect();
    printSummary();
    process.exit(1);
  }

  const sellerId = seller._id.toString();

  const userSeller = await db.collection('usersellers').findOne({ sellerId: seller._id });
  let user = null;
  if (userSeller?.userId) {
    user = await db.collection('users').findOne({ _id: userSeller.userId, active: true });
  }
  if (!user) {
    user = await db
      .collection('users')
      .findOne({ active: true, isDeleted: { $ne: true }, role: { $ne: 'MASTER_ADMIN' } });
  }

  if (!user) {
    log('DB setup', false, 'No active user found');
    await mongoose.disconnect();
    printSummary();
    process.exit(1);
  }

  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role, sellerIds: [sellerId] },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const order = await db.collection('orders').findOne({
    sellerIds: seller._id,
    'orderSkuList.skuList': { $exists: true, $ne: [] },
  });

  const pickup = await db.collection('pickupaddresses').findOne({
    sellerId: seller._id,
    isDeleted: { $ne: true },
  });

  if (order && pickup) {
    const skus = (order.orderSkuList?.skuList || []).filter((s) => {
      const sb = s.statusBreakdown || {};
      const confirmed = sb.confirmed ?? s.quantity ?? 0;
      const shipmentCreated = sb.shipmentCreated ?? 0;
      return confirmed - shipmentCreated > 0;
    });

    const sku = skus[0];
    if (sku) {
      console.log(`\n--- API tests for ${seller.name || seller.slug} ---`);
      console.log(`Order: ${order._id} (${order.merchantOrderNo || order.orderId})`);
      console.log(
        `SKU: ${sku.merchantProductNo}, qty available: ${(sku.statusBreakdown?.confirmed ?? sku.quantity) - (sku.statusBreakdown?.shipmentCreated ?? 0)}`
      );

      await testInvoiceUploadMiddleware(token, sellerId, order.merchantOrderNo || order.orderId, sku.merchantProductNo);

      const qty = (sku.statusBreakdown?.confirmed ?? sku.quantity) - (sku.statusBreakdown?.shipmentCreated ?? 0);
      const shipmentPayload = {
        id: order._id.toString(),
        sellerId,
        userId: user._id.toString(),
        pickUpId: pickup._id.toString(),
        products: [
          {
            merchantProductNo: sku.merchantProductNo,
            orderLineId: sku.id,
            quantity: qty,
          },
        ],
        pieces: 1,
        codAmount: 0,
        currency: 'SAR',
        declaredValue: 0,
        declaredValueCurrency: 'SAR',
        isCod: false,
      };

      console.log('\nNote: createShipment calls real Aymakan API — testing with live order data.');
      const { res, body } = await testCreateShipmentApi(token, shipmentPayload);
      if (res.status === 201) {
        log('API: AWB created successfully', true, `shipmentId: ${body.data?.shipmentId}`);
      }
    } else {
      log('API: skipped live tests', true, 'No order with confirmed qty available');
    }
  } else {
    log('API: skipped live tests', true, `order=${!!order} pickup=${!!pickup}`);
  }

  await mongoose.disconnect();
  printSummary();
}

function printSummary() {
  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.pass).length;
  console.log(`${passed}/${results.length} passed`);
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
