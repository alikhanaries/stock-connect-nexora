/**
 * ONE-TIME backfill: recover channelengineorders with empty orderSkuList.skuList.
 *
 * Historical sync dropped CE lines when Product.productSkuCode was missing and
 * ExtraData.sellerId fallback did not yet exist. Those orders have totals but
 * empty skuList and no sellerorders — invisible in Live Orders.
 *
 * This script:
 *   1. Finds CE orders with empty skuList
 *   2. Refetches each order from ChannelEngine API
 *   3. Re-runs sanitizeOrdersData() (with ExtraData sellerId fallback)
 *   4. Updates channelengineorders + creates missing sellerorders
 *   5. Skips orders that still cannot resolve any sellerId
 *
 * Usage:
 *   yarn backfill:empty-sku-ce-orders              # dry-run
 *   yarn backfill:empty-sku-ce-orders --execute    # apply writes
 *   yarn backfill:empty-sku-ce-orders --limit=50   # cap candidates
 */
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import mongoose from 'mongoose';
import { config } from '../src/config/config.js';
import Order from '../src/models/Orders.js';
import { sanitizeOrdersData, getExtraSellerId } from '../src/helpers/Order.js';
import { upsertSellerOrdersFromOrder } from '../src/service/sellerOrderService.js';

const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 0) : null;

async function fetchAllCeOrdersById(wantedIds) {
  const need = new Set(wantedIds.map(String));
  const found = new Map();
  let page = 1;

  while (need.size > 0 && page <= 60) {
    const url = `${CHANNEL_ENGINE_BASE_URL}orders?apiKey=${CHANNEL_ENGINE_API_KEY}&page=${page}&pageSize=100`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ChannelEngine HTTP ${res.status} on page ${page}`);
    }
    const data = await res.json();
    const content = data.Content || [];
    if (!content.length) break;

    for (const order of content) {
      const id = String(order.Id);
      if (need.has(id)) {
        found.set(id, order);
        need.delete(id);
      }
    }

    if (content.length < 100) break;
    page++;
    if (page % 10 === 0) {
      console.log(`  CE fetch page ${page}, remaining ${need.size}`);
    }
  }

  return { found, missing: [...need] };
}

function collectMissingSkus(ceOrder, bulkSkuList) {
  const kept = new Set((bulkSkuList || []).map((s) => s.merchantProductNo).filter(Boolean));
  return (ceOrder.Lines || []).map((l) => l.MerchantProductNo).filter((mpn) => mpn && !kept.has(mpn));
}

function collectExtraSellerIds(ceOrder) {
  const ids = [];
  for (const line of ceOrder.Lines || []) {
    const sid = getExtraSellerId(line.ExtraData);
    if (sid) ids.push(String(sid));
  }
  return [...new Set(ids)];
}

async function main() {
  console.log(
    `\nbackfill-empty-sku-ce-orders  mode=${execute ? 'EXECUTE' : 'DRY-RUN'}${limit ? ` limit=${limit}` : ''}\n`
  );

  await mongoose.connect(config.DB_URL);
  console.log(`DB: ${mongoose.connection.db.databaseName}`);

  const query = {
    $or: [{ 'orderSkuList.skuList': { $size: 0 } }, { 'orderSkuList.skuList': { $exists: false } }],
  };

  let candidates = await Order.find(query).select('orderId channelName status channelOrderNumber').lean();
  if (limit) candidates = candidates.slice(0, limit);

  console.log(`Candidates (empty skuList): ${candidates.length}`);

  const summary = {
    ordersProcessed: 0,
    ordersRecovered: 0,
    ordersStillSkipped: 0,
    ceNotFound: 0,
    missingProductSkus: new Set(),
    sellerIdsFromExtraData: new Set(),
    recoveredOrderIds: [],
    skippedOrderIds: [],
  };

  if (!candidates.length) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const { found: ceById, missing: ceMissing } = await fetchAllCeOrdersById(candidates.map((c) => c.orderId));
  summary.ceNotFound = ceMissing.length;
  for (const id of ceMissing) {
    summary.ordersStillSkipped++;
    summary.skippedOrderIds.push({ orderId: id, reason: 'not_found_in_channelengine' });
  }

  const ceOrders = candidates.map((c) => ceById.get(String(c.orderId))).filter(Boolean);
  summary.ordersProcessed = ceOrders.length;

  // Process in batches so sanitize Product lookups stay bounded
  const BATCH = 50;
  for (let i = 0; i < ceOrders.length; i += BATCH) {
    const batch = ceOrders.slice(i, i + BATCH);
    const { bulkOps, sellerOrderPayloads } = await sanitizeOrdersData(batch);

    const recoveredIds = new Set(bulkOps.map((op) => String(op.updateOne?.filter?.orderId)));

    for (const ceOrder of batch) {
      const orderId = String(ceOrder.Id);
      if (!recoveredIds.has(orderId)) {
        summary.ordersStillSkipped++;
        const missingSkus = (ceOrder.Lines || []).map((l) => l.MerchantProductNo).filter(Boolean);
        missingSkus.forEach((s) => summary.missingProductSkus.add(s));
        summary.skippedOrderIds.push({
          orderId,
          reason: 'no_sellerId_resolvable',
          skus: missingSkus,
        });
      } else {
        for (const sid of collectExtraSellerIds(ceOrder)) {
          summary.sellerIdsFromExtraData.add(sid);
        }
      }
    }

    for (const op of bulkOps) {
      const set = op.updateOne.update.$set;
      const orderId = String(set.orderId);
      const missingSkus = collectMissingSkus(ceById.get(orderId), set.orderSkuList?.skuList);
      missingSkus.forEach((s) => summary.missingProductSkus.add(s));

      // Track ExtraData usage: lines where Product wouldn't have matched still have sellerId
      for (const sku of set.orderSkuList?.skuList || []) {
        const ceLine = (ceById.get(orderId)?.Lines || []).find((l) => String(l.Id) === String(sku.id));
        const fromExtra = getExtraSellerId(ceLine?.ExtraData);
        if (fromExtra && String(fromExtra) === String(sku.sellerId)) {
          summary.sellerIdsFromExtraData.add(String(fromExtra));
        }
      }
    }

    if (execute && bulkOps.length) {
      await Order.bulkWrite(bulkOps, { ordered: false });
      await Promise.all(sellerOrderPayloads.map((p) => upsertSellerOrdersFromOrder(p)));
      summary.ordersRecovered += bulkOps.length;
      summary.recoveredOrderIds.push(...[...recoveredIds]);
      console.log(`  Wrote batch ${i / BATCH + 1}: recovered ${bulkOps.length}`);
    } else if (bulkOps.length) {
      summary.ordersRecovered += bulkOps.length;
      summary.recoveredOrderIds.push(...[...recoveredIds]);
      console.log(`  Dry-run batch ${i / BATCH + 1}: would recover ${bulkOps.length}`);
    }
  }

  const report = {
    mode: execute ? 'EXECUTE' : 'DRY-RUN',
    ordersProcessed: summary.ordersProcessed,
    ordersRecovered: summary.ordersRecovered,
    ordersStillSkipped: summary.ordersStillSkipped,
    ceNotFound: summary.ceNotFound,
    missingProductSkus: [...summary.missingProductSkus].sort(),
    sellerIdsResolvedFromExtraData: [...summary.sellerIdsFromExtraData].sort(),
    recoveredOrderIdsSample: summary.recoveredOrderIds.slice(0, 30),
    skippedSample: summary.skippedOrderIds.slice(0, 20),
  };

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('backfill-empty-sku-ce-orders failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
