/**
 * READ-ONLY debug helper: fetch raw orders straight from the ChannelEngine API
 * and dump the untouched response to a JSON file. No DB connection, no writes,
 * no sanitize/store logic — just the raw payload, for inspecting why a given
 * order's sellerId/ExtraData isn't resolving during sync.
 *
 * Usage:
 *   node scripts/dump-ce-orders.mjs
 *   node scripts/dump-ce-orders.mjs ./scripts/_scratch/ce-orders.json
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { getNewOrders } from '../src/service/orderService.js';

const outPath = process.argv[2] || './scripts/_scratch/ce-orders-raw.json';

console.log('Fetching raw orders from ChannelEngine (no DB writes)...');
const result = await getNewOrders('[dump-ce-orders]');

if (!result.success) {
  console.error('Fetch FAILED:', result.message);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result.data, null, 2));

console.log(`Wrote ${result.data.length} raw order(s) to ${outPath}`);
process.exit(0);
