import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

await mongoose.connect(process.env.DB_URL);
const db = mongoose.connection.db;

const targets = [
  { id: '69d93bd51ae1e4d1531b6a46', name: 'manijero' },
  { id: '690aee9392ed9ac374a33275', name: 'respire' },
];

for (const t of targets) {
  const sid = new mongoose.Types.ObjectId(t.id);
  const orderCount = await db.collection('orders').countDocuments({ sellerIds: sid });
  const pickup = await db.collection('pickupaddresses').findOne({ sellerId: sid, isDeleted: { $ne: true } });
  const order = await db.collection('orders').findOne({ sellerIds: sid });
  console.log(`\n=== ${t.name} === orders:${orderCount} pickup:${pickup?._id || 'NONE'}`);
  if (order) {
    const sku = order.orderSkuList?.skuList?.[0];
    console.log(' order:', order._id, order.merchantOrderNo || order.orderId);
    if (sku) console.log(' sku:', sku.merchantProductNo, 'breakdown:', sku.statusBreakdown);
  }
}

// Test invoice middleware against live API for manijero even without order
const userSeller = await db.collection('usersellers').findOne({
  sellerId: new mongoose.Types.ObjectId(targets[0].id),
});
const user = userSeller
  ? await db.collection('users').findOne({ _id: userSeller.userId })
  : await db.collection('users').findOne({ active: true });

const token = jwt.sign(
  { id: user._id.toString(), email: user.email, role: user.role, sellerIds: [targets[0].id] },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const pdfPath = path.join(__dirname, 'test-invoice.pdf');
if (!fs.existsSync(pdfPath)) fs.writeFileSync(pdfPath, '%PDF-1.4\n%%EOF\n');

const form = new FormData();
form.append('orderId', 'TEST-ORDER-001');
form.append('skuCodes', 'TEST-SKU');
form.append('sellerId', targets[0].id);
form.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'test.pdf');

console.log('\n=== Live API: invoice upload (sellerId in body only) ===');
const res = await fetch(`${BASE_URL}/orders/generate-documentId`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'en' },
  body: form,
});
const body = await res.json().catch(() => ({}));
console.log('HTTP', res.status, body.message || body);

const blocked = body.message === 'Seller ID is required';
console.log(
  blocked ? 'FAIL: still blocked by middleware' : 'PASS: middleware fix works (not blocked by missing sellerId)'
);

await mongoose.disconnect();
