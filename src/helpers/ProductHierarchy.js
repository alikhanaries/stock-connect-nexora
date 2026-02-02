import Product from '#models/Product.js';
import { LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD_SELLERS } from '#constants/common.js';
import Seller from '#models/Seller.js';

/**
 * Performs basic structure checks:
 * - no self-references
 * - no identical parent & grandparent
 * - simple products cannot have both
 */
export function validateHierarchy(product) {
  const errors = [];
  const { productSkuCode: sku, parentProductSkuCode: parent, grandParentProductSkuCode: grand } = product;

  // Protect against self-parenting
  if (sku && (sku === parent || sku === grand)) {
    errors.push(`SKU '${sku}' cannot reference itself as parent or grandparent.`);
  }

  // Parent and grandparent cannot be identical
  if (parent && grand && parent === grand) {
    errors.push(`SKU '${sku}' cannot have the same parent and grandparent ('${parent}').`);
  }

  // A child cannot point to both
  if (parent && grand) {
    errors.push(`Child SKU '${sku}' should reference only a parent — not both.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates hierarchy across the entire batch:
 * - Finds missing parent / grandparent SKUs
 * - Checks existence either in the current sheet OR database
 * - Only one DB query is used for all rows
 */
export async function validateHierarchyExistenceBatch(products, sellerId) {
  const errors = [];
  const validated = [];

  const sheetSKUs = new Set(products.map((p) => p.productSkuCode));
  const missingRefs = new Set();

  // Collect all referenced parents/grandparents
  for (const p of products) {
    if (p.parentProductSkuCode && !sheetSKUs.has(p.parentProductSkuCode)) {
      missingRefs.add(p.parentProductSkuCode);
    }
    if (p.grandParentProductSkuCode && !sheetSKUs.has(p.grandParentProductSkuCode)) {
      missingRefs.add(p.grandParentProductSkuCode);
    }
  }

  // Fetch those references from DB
  let dbSKUs = new Set();
  if (missingRefs.size > 0) {
    const dbProducts = await Product.find(
      { sellerId, productSkuCode: { $in: [...missingRefs] } },
      { productSkuCode: 1 }
    ).lean();

    dbSKUs = new Set(dbProducts.map((p) => p.productSkuCode));
  }

  // Validate existence row by row
  for (const p of products) {
    const rowErrors = [];

    // Parent must exist somewhere
    if (p.parentProductSkuCode && !sheetSKUs.has(p.parentProductSkuCode) && !dbSKUs.has(p.parentProductSkuCode)) {
      rowErrors.push(`Parent SKU '${p.parentProductSkuCode}' not found for '${p.productSkuCode}'.`);
    }

    // Grandparent must exist somewhere
    if (
      p.grandParentProductSkuCode &&
      !sheetSKUs.has(p.grandParentProductSkuCode) &&
      !dbSKUs.has(p.grandParentProductSkuCode)
    ) {
      rowErrors.push(`Grandparent SKU '${p.grandParentProductSkuCode}' not found for '${p.productSkuCode}'.`);
    }

    const valid = rowErrors.length === 0;
    if (!valid) errors.push({ rowNumber: p.rowNumber, errorData: rowErrors });

    validated.push({ product: p, valid, errors: rowErrors });
  }

  return { validated, errors };
}

/**
 * Automatically resolves product types for all products:
 * - Any SKU referenced as parent or grandparent → configurable
 * - Everything else → simple
 * - Done via a single aggregation + 2 updates for maximum performance
 */
export async function resolveProductTypes(sellerId) {
  // Fetch only needed fields
  const products = await Product.find(
    { sellerId },
    {
      productSkuCode: 1,
      parentProductSkuCode: 1,
      grandParentProductSkuCode: 1,
    }
  ).lean();

  const configurableSKUs = new Set();

  for (const p of products) {
    // RULE 1 & 2: referenced by others
    if (p.parentProductSkuCode) configurableSKUs.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) configurableSKUs.add(p.grandParentProductSkuCode);

    // RULE 3: this row itself declares a grandparent
    if (p.grandParentProductSkuCode) configurableSKUs.add(p.productSkuCode);
  }

  const configurableArray = [...configurableSKUs];

  // CONFIGURABLE
  await Product.updateMany(
    { sellerId, productSkuCode: { $in: configurableArray } },
    { $set: { productType: 'configurable' } }
  );

  // SIMPLE
  await Product.updateMany(
    { sellerId, productSkuCode: { $nin: configurableArray } },
    { $set: { productType: 'simple' } }
  );
}

/**
 * Resolves product `status` based on stock and hierarchy.
 *
 * Rules:
 * - Simple products → ACTIVE if stock > 0, else INACTIVE
 * - Parent / Grandparent → ACTIVE if any child is active
 * - Status always propagates upward (child → parent → grandparent)
 */
export async function resolveHierarchyStatus(sellerId) {
  // fetch seller
  const seller = await Seller.findById(sellerId, { name: 1 }).lean();
  const sellerName = seller?.name?.toLowerCase();
  if (!sellerName) throw new Error('Seller not found');
  // special rule sellers
  const isLowStockThresholdSeller = LOW_STOCK_THRESHOLD_SELLERS.includes(sellerName);

  const products = await Product.find(
    { sellerId },
    {
      productSkuCode: 1,
      parentProductSkuCode: 1,
      grandParentProductSkuCode: 1,
      currentStockCount: 1,
      productType: 1,
      status: 1,
    }
  ).lean();

  const bySku = new Map(products.map((p) => [p.productSkuCode, p]));

  const mustBeActive = new Set();

  // STEP 1: simple products → stock based rule
  for (const p of products) {
    if (p.productType === 'simple') {
      const stock = p.currentStockCount || 0;

      const isActive = isLowStockThresholdSeller
        ? stock >= LOW_STOCK_THRESHOLD // KIP / REMSY rule
        : stock > 0; // default rule

      if (isActive) {
        mustBeActive.add(p.productSkuCode);
      }
    }
  }

  // STEP 2: propagate ACTIVE upward
  let changed = true;
  while (changed) {
    changed = false;

    for (const sku of [...mustBeActive]) {
      const p = bySku.get(sku);

      if (p?.parentProductSkuCode && !mustBeActive.has(p.parentProductSkuCode)) {
        mustBeActive.add(p.parentProductSkuCode);
        changed = true;
      }

      if (p?.grandParentProductSkuCode && !mustBeActive.has(p.grandParentProductSkuCode)) {
        mustBeActive.add(p.grandParentProductSkuCode);
        changed = true;
      }
    }
  }

  // STEP 3: bulk status updates
  await Product.updateMany({ sellerId, productSkuCode: { $in: [...mustBeActive] } }, { $set: { status: 'active' } });

  await Product.updateMany(
    {
      sellerId,
      productSkuCode: { $nin: [...mustBeActive] },
    },
    { $set: { status: 'inactive' } }
  );
}
