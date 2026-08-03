/**
 * ONE-TIME migration: fix false IN_PROGRESS ChannelEngine orders (no fulfillment → NEW).
 *
 * Safe to run once after deploying the CE status fix. Idempotent — a second run updates 0 rows.
 * Does NOT touch: SHIPPED, CLOSED, OCP orders, invoiced orders, or any order with shipment activity.
 *
 * Usage:
 *   yarn backfill:ce-order-status                    # dry-run (all sellers, no writes)
 *   yarn backfill:ce-order-status respire            # dry-run (one seller)
 *   yarn backfill:ce-order-status --execute          # apply (all sellers)
 *   yarn backfill:ce-order-status respire --execute  # apply (one seller)
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/config.js';
import Order from '../src/models/Orders.js';
import Seller from '../src/models/Seller.js';
import SellerOrder from '../src/models/OrderSchema/SellerOrder.js';
import {
  resolveStoredSkuStatus,
  deriveSellerOrderStatusFromSkus,
  syncSellerOrdersFromOrder,
} from '../src/service/sellerOrderService.js';

const TERMINAL_ORDER_STATUSES = ['SHIPPED', 'CLOSED', 'CANCELED', 'RETURNED'];
const TERMINAL_SKU_STATUSES = ['SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELED'];

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const sellerSlug = args.find((a) => !a.startsWith('--')) || null;

function parsePlan(order, seller) {
  const skuList = order.orderSkuList?.skuList || [];
  const sellerSkus = skuList.filter((s) => String(s.sellerId) === String(seller._id));

  if (!sellerSkus.length) {
    return { skip: true, reason: 'no SKUs for this seller' };
  }

  if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
    return { skip: true, reason: `order already terminal (${order.status})` };
  }

  const skuChanges = [];
  for (const sku of sellerSkus) {
    const b = sku.statusBreakdown || {};
    const qty = sku.quantity || 0;

    if (TERMINAL_SKU_STATUSES.includes((sku.status || '').toUpperCase())) {
      continue;
    }
    if (sku.documentId) {
      continue;
    }
    if ((b.shipmentCreated || 0) > 0 || (b.shipped || 0) > 0 || (b.delivered || 0) > 0) {
      continue;
    }

    const newStatus = resolveStoredSkuStatus({ breakdown: b, qty, existingSku: sku });
    if (newStatus !== sku.status) {
      skuChanges.push({ from: sku.status, to: newStatus, sku: sku.merchantProductNo });
    }
  }

  if (!skuChanges.length) {
    return { skip: true, reason: 'no SKU status change needed' };
  }

  const previewSkus = sellerSkus.map((sku) => {
    const change = skuChanges.find((c) => c.sku === sku.merchantProductNo);
    return change ? { ...sku, status: change.to } : sku;
  });
  const newOrderStatus = deriveSellerOrderStatusFromSkus(previewSkus);

  // Never downgrade a terminal derived status (extra guard)
  if (TERMINAL_ORDER_STATUSES.includes(newOrderStatus) && order.status === 'IN_PROGRESS') {
    // allowed: IN_PROGRESS → CLOSED only if SKUs are canceled/delivered — resolveStoredSkuStatus handles that
  }

  return {
    skip: false,
    skuChanges,
    before: { order: order.status, sellerSkus: sellerSkus.map((s) => s.status) },
    after: { order: newOrderStatus },
  };
}

console.log('\n=== CE ORDER STATUS BACKFILL (one-time migration) ===');
console.log(`Mode: ${execute ? 'EXECUTE (will write to DB)' : 'DRY-RUN (no writes)'}`);
if (!execute) {
  console.log('Add --execute to apply changes after reviewing this output.\n');
}

await mongoose.connect(config.DB_URL);

const sellers = sellerSlug
  ? await Seller.find({ slug: sellerSlug, isDeleted: { $ne: true } })
      .select('_id slug name')
      .lean()
  : await Seller.find({ isDeleted: { $ne: true } })
      .select('_id slug name')
      .lean();

if (!sellers.length) {
  console.error('No sellers found');
  process.exit(1);
}

const summary = {
  sellers: sellers.length,
  candidates: 0,
  wouldUpdate: 0,
  updated: 0,
  skipped: 0,
  skipReasons: {},
};

for (const seller of sellers) {
  const candidates = await Order.find({
    sellerIds: seller._id,
    channelName: { $ne: 'OCP' },
    status: { $nin: TERMINAL_ORDER_STATUSES },
    'orderSkuList.skuList.statusBreakdown.shipmentCreated': 0,
    'orderSkuList.skuList.statusBreakdown.shipped': 0,
    'orderSkuList.skuList.statusBreakdown.delivered': 0,
  }).select('_id orderId channelName status orderSkuList sellerIds');

  if (!candidates.length) continue;

  console.log(`\n--- ${seller.name} (${seller.slug}): ${candidates.length} candidate(s) ---`);
  summary.candidates += candidates.length;

  for (const order of candidates) {
    const plan = parsePlan(order, seller);

    if (plan.skip) {
      summary.skipped++;
      summary.skipReasons[plan.reason] = (summary.skipReasons[plan.reason] || 0) + 1;
      continue;
    }

    summary.wouldUpdate++;
    console.log(
      `  ${execute ? 'UPDATE' : 'WOULD UPDATE'} ${order.orderId} (${order.channelName}): ` +
        `order ${plan.before.order} → ${plan.after.order}, ` +
        `SKU(s) ${plan.skuChanges.map((c) => `${c.from}→${c.to}`).join(', ')}`
    );

    if (!execute) continue;

    const skuList = order.orderSkuList?.skuList || [];
    for (const sku of skuList) {
      if (String(sku.sellerId) !== String(seller._id)) continue;
      const change = plan.skuChanges.find((c) => c.sku === sku.merchantProductNo);
      if (change) sku.status = change.to;
    }

    order.status = plan.after.order;
    await order.save({ validateBeforeSave: false });
    await syncSellerOrdersFromOrder(order._id);
    summary.updated++;
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Sellers scanned:     ${summary.sellers}`);
console.log(`Candidates checked:  ${summary.candidates}`);
console.log(`Would update:        ${summary.wouldUpdate}`);
if (execute) {
  console.log(`Actually updated:    ${summary.updated}`);
} else {
  console.log(`Actually updated:    0 (dry-run)`);
}
console.log(`Skipped (safe):      ${summary.skipped}`);
if (Object.keys(summary.skipReasons).length) {
  console.log('Skip reasons:', summary.skipReasons);
}

console.log('\n=== SAFETY NOTES ===');
console.log('- Idempotent: safe to run again; already-correct orders are skipped.');
console.log('- Never modifies: SHIPPED, CLOSED, OCP, invoiced (documentId), or shipment activity.');
console.log('- Run dry-run first, then once with --execute after deploying the code fix.');

await mongoose.disconnect();
process.exit(0);
