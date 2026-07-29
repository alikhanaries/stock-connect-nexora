/**
 * Drop unique MongoDB index on sellers.taxIdentificationNumber.
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-drop-seller-tax-id-unique-index.mjs
 *   node scripts/migrate-drop-seller-tax-id-unique-index.mjs --dry-run
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const INDEX_NAME = 'taxIdentificationNumber_1';
const COLLECTION = 'sellers';
const dryRun = process.argv.includes('--dry-run');

const findTaxIdIndex = (indexes) =>
  indexes.find(
    (idx) => idx.name === INDEX_NAME || (idx.key?.taxIdentificationNumber === 1 && Object.keys(idx.key).length === 1)
  );

async function main() {
  if (!process.env.DB_URL) {
    console.error('DB_URL is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.DB_URL);
  const collection = mongoose.connection.db.collection(COLLECTION);

  const before = await collection.indexes();
  const taxIndex = findTaxIdIndex(before);

  console.log('=== sellers.taxIdentificationNumber index migration ===');
  console.log('Database:', mongoose.connection.db.databaseName);
  console.log('Dry run:', dryRun);
  console.log('');

  if (!taxIndex) {
    console.log('No index on taxIdentificationNumber found — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log('Current index:', JSON.stringify({ name: taxIndex.name, key: taxIndex.key, unique: taxIndex.unique }));

  if (!taxIndex.unique) {
    console.log('Index exists but is not unique — no migration required.');
    await mongoose.disconnect();
    return;
  }

  if (dryRun) {
    console.log(`Would drop unique index "${taxIndex.name}" on ${COLLECTION}.`);
    await mongoose.disconnect();
    return;
  }

  await collection.dropIndex(taxIndex.name);
  console.log(`Dropped unique index "${taxIndex.name}".`);

  const after = await collection.indexes();
  const remaining = findTaxIdIndex(after);

  if (remaining?.unique) {
    console.error('Migration failed — unique taxIdentificationNumber index still present.');
    process.exit(1);
  }

  console.log('Verification: no unique index on taxIdentificationNumber.');
  console.log(
    'Remaining seller indexes:',
    after.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique }))
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
