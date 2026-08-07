/**
 * Diagnose (and optionally drop) a stale standalone unique index on
 * channelengineorders.channelOrderNumber.
 *
 * ChannelEngine's SPLIT_ORDERS support means multiple distinct orders can
 * legitimately share the same channelOrderNumber under different orderIds.
 * The current schema only enforces uniqueness on orderId alone and on the
 * compound (orderId, channelOrderNumber) pair — NOT on channelOrderNumber
 * by itself. If an old standalone unique index on channelOrderNumber is
 * still present in the live DB from a prior schema version (Mongoose never
 * auto-drops indexes when schema code changes), any split order triggers
 * E11000 during Order.bulkWrite, which aborts the entire sync run.
 *
 * Read-only by default. Pass --execute to actually drop the stale index
 * once confirmed.
 *
 * Usage:
 *   node scripts/check-channelordernumber-index.mjs             # list only
 *   node scripts/check-channelordernumber-index.mjs --execute   # drop if found
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { config } from '../src/config/config.js';

const COLLECTION = 'channelengineorders';
const execute = process.argv.includes('--execute');

const isStandaloneUniqueOn = (idx, field) =>
  idx.unique === true && idx.key?.[field] === 1 && Object.keys(idx.key).length === 1;

async function main() {
  console.log('\n=== channelengineorders.channelOrderNumber index check ===');
  console.log(`Mode: ${execute ? 'EXECUTE (will drop if found)' : 'DIAGNOSE ONLY (no changes)'}\n`);

  await mongoose.connect(config.DB_URL);
  const collection = mongoose.connection.db.collection(COLLECTION);

  const indexes = await collection.indexes();
  console.log(`All indexes on ${COLLECTION}:`);
  for (const idx of indexes) {
    console.log(`  - ${idx.name}: key=${JSON.stringify(idx.key)} unique=${!!idx.unique}`);
  }

  const staleIndex = indexes.find((idx) => isStandaloneUniqueOn(idx, 'channelOrderNumber'));

  if (!staleIndex) {
    console.log('\nNo standalone unique index on channelOrderNumber found — nothing to fix here.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nFOUND stale standalone unique index: "${staleIndex.name}" on channelOrderNumber.`);
  console.log('This will throw E11000 whenever ChannelEngine sends a split order sharing a channelOrderNumber.');

  if (!execute) {
    console.log(`\nRe-run with --execute to drop index "${staleIndex.name}".`);
    await mongoose.disconnect();
    return;
  }

  await collection.dropIndex(staleIndex.name);
  console.log(`\nDropped index "${staleIndex.name}".`);

  const after = await collection.indexes();
  const remaining = after.find((idx) => isStandaloneUniqueOn(idx, 'channelOrderNumber'));
  if (remaining) {
    console.error('Verification FAILED — standalone unique index on channelOrderNumber still present.');
    process.exitCode = 1;
  } else {
    console.log('Verification OK — no standalone unique index remains on channelOrderNumber.');
    console.log(
      'Remaining indexes:',
      after.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique }))
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});
