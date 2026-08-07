/**
 * ONE-TIME migration: remap order lines pointing at hard-deleted sellerIds to their
 * current, still-active seller (same brand, re-onboarded under a new Seller document).
 *
 * Background: since the Aug 3 2026 seller-resolution fix, order lines whose sellerId
 * no longer exists in the Seller collection are correctly excluded from SellerOrder
 * creation (so they don't show up under any seller's order list). Some of those
 * "deleted" sellerIds actually belong to brands that still exist today under a
 * different, current Seller document. This script remaps those known brand mappings,
 * then regenerates the SellerOrder row for every affected order.
 *
 * Safe to run more than once — orders with no remaining dead sellerId are skipped.
 *
 * Usage:
 *   yarn remap:deleted-seller-orders            # dry-run (no writes)
 *   yarn remap:deleted-seller-orders --execute  # apply
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/config.js';
import Order from '../src/models/Orders.js';
import { syncSellerOrdersFromOrder } from '../src/service/sellerOrderService.js';

const args = process.argv.slice(2);
const execute = args.includes('--execute');

// Confirmed brand -> current seller mapping (2026-08-07, from production data review with the user).
const SELLER_REMAP = {
  '690dd19b1acff8eed6dd999f': { newSellerId: '69f9dd8f82e186d6b33abf67', brand: 'respire' },
  '696f5ae62cb776f1cfe6e65e': { newSellerId: '69ce5955b82807100854e150', brand: 'manijero' },
  '691f046ed9b696a35c7d552a': { newSellerId: '69d3487b9bfa8cda362b27f4', brand: 'kip' },
  '691f0454d9b696a35c7d5519': { newSellerId: '69d3489c9bfa8cda362b27ff', brand: 'ramsey' },
  '693ffa44670f266a93e924d8': { newSellerId: '69d37e289bfa8cda362b3291', brand: 'test seller' },
  '68e78771d6be8842f72a1b61': { newSellerId: '69d37e289bfa8cda362b3291', brand: 'test seller' },
};

const deadIds = Object.keys(SELLER_REMAP);

console.log('\n=== REMAP DELETED-SELLER ORDER LINES (one-time migration) ===');
console.log(`Mode: ${execute ? 'EXECUTE (will write to DB)' : 'DRY-RUN (no writes)'}`);
if (!execute) {
  console.log('Add --execute to apply changes after reviewing this output.\n');
}
console.log('Mapping:');
for (const [deadId, { newSellerId, brand }] of Object.entries(SELLER_REMAP)) {
  console.log(`  ${deadId} (${brand}) -> ${newSellerId}`);
}

await mongoose.connect(config.DB_URL);

const orders = await Order.find({
  'orderSkuList.skuList.sellerId': { $in: deadIds.map((id) => new mongoose.Types.ObjectId(id)) },
});

console.log(`\nFound ${orders.length} order(s) with at least one dead-seller SKU line.\n`);

const summary = { scanned: orders.length, updated: 0, resynced: 0, failed: 0, skuLinesRemapped: 0 };

for (const order of orders) {
  try {
    const skuList = order.orderSkuList?.skuList || [];
    let changed = false;

    for (const sku of skuList) {
      const deadId = sku.sellerId ? String(sku.sellerId) : null;
      const remap = deadId && SELLER_REMAP[deadId];
      if (!remap) continue;

      changed = true;
      summary.skuLinesRemapped++;
      if (execute) {
        sku.sellerId = new mongoose.Types.ObjectId(remap.newSellerId);
      }
    }

    if (!changed) continue;

    console.log(
      `${execute ? 'UPDATE' : 'WOULD UPDATE'} orderId=${order.orderId} — remapped ${skuList.filter((s) => SELLER_REMAP[String(s.sellerId)]).length} SKU line(s)`
    );

    if (!execute) continue;

    const sellerIds = [...new Set(skuList.map((s) => String(s.sellerId)).filter(Boolean))].map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    order.sellerIds = sellerIds;
    order.sellerId = sellerIds[0];
    order.markModified('orderSkuList.skuList');

    await order.save({ validateBeforeSave: false });
    summary.updated++;

    await syncSellerOrdersFromOrder(order._id);
    summary.resynced++;
  } catch (error) {
    summary.failed++;
    console.error(`FAILED orderId=${order.orderId}:`, error.message);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Orders scanned:        ${summary.scanned}`);
console.log(`SKU lines remapped:    ${summary.skuLinesRemapped}`);
if (execute) {
  console.log(`Orders updated:        ${summary.updated}`);
  console.log(`Orders resynced:       ${summary.resynced}`);
  console.log(`Failed:                ${summary.failed}`);
} else {
  console.log('Orders updated:        0 (dry-run)');
}

console.log('\n=== SAFETY NOTES ===');
console.log('- Idempotent: orders with no remaining dead sellerId are skipped on re-run.');
console.log('- Only touches the 6 known dead sellerIds above — no other data is modified.');
console.log('- Run dry-run first, then once with --execute.');
console.log('- Run AFTER deploying the backfillMissingSellerOrders fault-isolation fix.');

await mongoose.disconnect();
process.exit(0);
