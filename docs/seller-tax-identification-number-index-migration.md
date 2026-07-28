# Deployment Guide — Drop `sellers.taxIdentificationNumber` Unique Index

Production-oriented runbook for DevOps. Application code removes duplicate-TIN validation in `sellerService.js`; this migration removes the database constraint that still blocks duplicate values.

---

## Why this migration is required

- Duplicate Tax Identification Numbers (TIN) are now allowed at the application layer.
- The Mongoose `Seller` schema does **not** define `unique: true` on `taxIdentificationNumber`.
- **Mongoose does not remove existing MongoDB indexes** when the schema changes.
- Databases may still have a legacy **unique** index `taxIdentificationNumber_1`.

If the unique index remains after the application change:

- Create/update with an existing TIN fails with **E11000 duplicate key error** (typically HTTP **500**).
- The old **409 TAX_ID_EXISTS** response is gone, but writes still fail at the database layer.

---

## Recommended deployment order

| Step  | Action                                                     |
| ----- | ---------------------------------------------------------- |
| **1** | Run this index migration on the target MongoDB database    |
| **2** | Deploy application code (duplicate TIN validation removed) |
| **3** | Verify create/update with duplicate TIN succeeds           |

Either order works for this migration (dropping unique is backward-compatible with old code that rejected duplicates at the app layer). **Both** steps are required for duplicate TIN writes to succeed.

---

## Option A — Migration script (recommended)

From the project root, with `DB_URL` set in `.env` or the environment:

```bash
# Preview only
node scripts/migrate-drop-seller-tax-id-unique-index.mjs --dry-run

# Execute
node scripts/migrate-drop-seller-tax-id-unique-index.mjs
```

The script is **idempotent**: it no-ops if the unique index is already absent.

---

## Option B — MongoDB shell (manual)

```javascript
use stockconnect-dev   // or your database name

db.sellers.getIndexes()
// Confirm taxIdentificationNumber_1 exists with "unique": true

db.sellers.dropIndex("taxIdentificationNumber_1")

db.sellers.getIndexes()
// Confirm taxIdentificationNumber_1 is gone (or non-unique if recreated elsewhere)
```

---

## Non-unique index — not recreated

A non-unique index on `taxIdentificationNumber` is **not** required:

- No application queries filter or sort by `taxIdentificationNumber` after duplicate validation was removed.
- The field is stored on seller documents for display/invoicing only.
- Recreating `taxIdentificationNumber_1` without `unique` would add write overhead with no current query benefit.

If future features search by TIN, add a **non-unique** index deliberately at that time.

---

## Verification checklist

- [ ] `db.sellers.getIndexes()` — no index on `taxIdentificationNumber` with `"unique": true`
- [ ] Create two sellers with the same `taxIdentificationNumber` via API — both succeed (201)
- [ ] Update a seller to another seller's TIN — succeeds (200)
- [ ] Duplicate seller **name** still returns 409 `SELLER_NAME_EXISTS`

---

## Rollback (restore uniqueness)

Only if product policy reverts to globally unique TIN:

```javascript
db.sellers.createIndex(
  { taxIdentificationNumber: 1 },
  { name: 'taxIdentificationNumber_1', unique: true, background: true }
);
```

**Warning:** This fails if duplicate TIN values already exist. Resolve duplicates before rollback.
