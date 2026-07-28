/** Post-migration duplicate TIN verification (one-off QA) */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Seller from '../src/models/Seller.js';
import sellerService from '../src/service/sellerService.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const results = [];
const pass = (id, detail) => {
  results.push({ id, ok: true, detail });
  console.log(`PASS [${id}] ${detail}`);
};
const fail = (id, detail) => {
  results.push({ id, ok: false, detail });
  console.log(`FAIL [${id}] ${detail}`);
};

const QA = `QA-TIN-${Date.now()}`;

await mongoose.connect(process.env.DB_URL);
const idx = await mongoose.connection.db.collection('sellers').indexes();
const taxUnique = idx.some((i) => i.unique && i.key?.taxIdentificationNumber === 1);
if (taxUnique) fail('TC-9', 'unique taxIdentificationNumber index still exists');
else pass('TC-9', 'no unique taxIdentificationNumber index');

const donor = await Seller.findOne({
  isDeleted: false,
  taxIdentificationNumber: { $exists: true, $nin: [null, ''] },
}).lean();
if (!donor) {
  console.log('BLOCKED: no donor');
  process.exit(2);
}
const dup = donor.taxIdentificationNumber;

const n1 = `${QA}-create`;
const r1 = await sellerService.createSeller({ name: n1, taxIdentificationNumber: dup });
if (!r1.isExist && !r1.isTaxIdExist && r1.data?.taxIdentificationNumber === dup)
  pass('TC-1', `created seller ${r1.data._id} tin=${dup}`);
else
  fail(
    'TC-1',
    JSON.stringify({ isExist: r1.isExist, isTaxIdExist: r1.isTaxIdExist, tin: r1.data?.taxIdentificationNumber })
  );

const db1 = await Seller.findById(r1.data._id).lean();
if (db1?.taxIdentificationNumber === dup) pass('TC-7a', 'duplicate TIN persisted on create');
else fail('TC-7a', `db tin=${db1?.taxIdentificationNumber}`);

const prep = await sellerService.createSeller({ name: `${QA}-upd`, taxIdentificationNumber: `${QA}-unique` });
let r2;
try {
  r2 = await sellerService.updateSeller(prep.data._id.toString(), { taxIdentificationNumber: dup });
  if (!r2?.isTaxIdExist && r2?.isUpdated && r2?.seller?.taxIdentificationNumber === dup)
    pass('TC-2', `updated seller tin=${dup}`);
  else
    fail(
      'TC-2',
      JSON.stringify({
        isUpdated: r2?.isUpdated,
        tin: r2?.seller?.taxIdentificationNumber,
        isTaxIdExist: r2?.isTaxIdExist,
      })
    );
} catch (e) {
  fail('TC-2', e.message);
}

const db2 = await Seller.findById(prep.data._id).lean();
if (db2?.taxIdentificationNumber === dup) pass('TC-7b', 'duplicate TIN persisted on update');
else fail('TC-7b', `db tin=${db2?.taxIdentificationNumber}`);

const dupCount = await Seller.countDocuments({ taxIdentificationNumber: dup, isDeleted: false });
if (dupCount >= 2) pass('TC-7c', `${dupCount} active sellers share TIN ${dup}`);
else fail('TC-7c', `only ${dupCount} seller(s) with TIN ${dup}`);

const r4 = await sellerService.createSeller({ name: n1, taxIdentificationNumber: dup });
if (r4.isExist === true && !r4.isTaxIdExist) pass('TC-4', 'duplicate name still blocked');
else fail('TC-4', JSON.stringify({ isExist: r4.isExist, isTaxIdExist: r4.isTaxIdExist }));

const rn = `${QA}-restore`;
const cd = await sellerService.createSeller({ name: rn, taxIdentificationNumber: `${QA}-before` });
const tid = cd.data._id;
await sellerService.softDeleteSellers([tid]);
const r3 = await sellerService.createSeller({ name: rn, taxIdentificationNumber: dup });
if (
  !r3.isExist &&
  r3.data?._id?.toString() === tid.toString() &&
  r3.data?.taxIdentificationNumber === dup &&
  r3.data?.isDeleted === false
)
  pass('TC-3', 'restore + fill TIN');
else fail('TC-3', JSON.stringify({ isExist: r3.isExist, tin: r3.data?.taxIdentificationNumber }));

const anyTax = [r1, r4, r2, r3].some((x) => x?.isTaxIdExist);
if (!anyTax) pass('TC-6', 'no isTaxIdExist from service');
else fail('TC-6', 'isTaxIdExist returned');

await sellerService.softDeleteSellers([r1.data._id, prep.data._id, tid].filter(Boolean));

console.log(`\nSUMMARY: ${results.filter((r) => r.ok).length}/${results.length} passed`);
await mongoose.disconnect();
process.exit(results.some((r) => !r.ok) ? 1 : 0);
