import Product from '#models/Product.js';
import { LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD_SELLERS, MAX_PRICE, MAX_PRICE_SELLERS } from '#constants/common.js';
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
 * Anything previously active for this seller that isn't in today's sync
 * feed (e.g. the ERP/Shopify source stopped returning it once it went out
 * of stock, or it was discontinued) gets marked removed, same as an
 * explicit 0-stock item would be.
 */
export async function markMissingSkusRemoved(sellerId, feedSkuCodes = []) {
  await Product.updateMany(
    {
      sellerId,
      status: { $ne: 'removed' },
      productSkuCode: { $nin: feedSkuCodes },
    },
    { $set: { status: 'removed', currentStockCount: 0 } }
  );
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
export async function resolveHierarchyStatus(sellerId, affectedSkus = []) {
  if (!affectedSkus.length) return;
  // fetch seller
  const seller = await Seller.findById(sellerId, { name: 1 }).lean();
  const sellerName = seller?.name?.toLowerCase();
  if (!sellerName) throw new Error('Seller not found');
  // special rule sellers
  const isLowStockThresholdSeller = LOW_STOCK_THRESHOLD_SELLERS.includes(sellerName);
  const isMaxPriceSeller = MAX_PRICE_SELLERS.includes(sellerName);
  const baseProducts = await Product.find(
    { sellerId, productSkuCode: { $in: affectedSkus } },
    {
      productSkuCode: 1,
      parentProductSkuCode: 1,
      grandParentProductSkuCode: 1,
    }
  ).lean();

  const hierarchySkus = new Set();

  for (const p of baseProducts) {
    hierarchySkus.add(p.productSkuCode);
    if (p.parentProductSkuCode) hierarchySkus.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode) hierarchySkus.add(p.grandParentProductSkuCode);
  }

  const products = await Product.find(
    { sellerId, productSkuCode: { $in: [...hierarchySkus] } },
    {
      productSkuCode: 1,
      parentProductSkuCode: 1,
      grandParentProductSkuCode: 1,
      currentStockCount: 1,
      price: 1,
      productType: 1,
      status: 1,
    }
  ).lean();

  const bySku = new Map(products.map((p) => [p.productSkuCode, p]));

  const mustBeActive = new Set();

  // STEP 1: simple products → stock + price based rule
  for (const p of products) {
    if (p.productType === 'simple') {
      const stock = p.currentStockCount || 0;
      const price = p.price || 0;

      const isActiveByStock = isLowStockThresholdSeller
        ? stock >= LOW_STOCK_THRESHOLD // KIP / REMSY rule
        : stock > 0; // default rule

      // KIP / REMSY / EXQUISE rule: price must be below MAX_PRICE
      const isActiveByPrice = isMaxPriceSeller ? price < MAX_PRICE : true;

      if (isActiveByStock && isActiveByPrice) {
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
      productSkuCode: { $in: affectedSkus.filter((s) => !mustBeActive.has(s)) },
    },
    { $set: { status: 'inactive' } }
  );
}

/**
 * Keeps sellable variants plus their parent / grandparent rows.
 * Drops simple products whose parent row is not present in the batch.
 */
export function filterValidHierarchyProducts(products, { requirePriceAndImage = true, requirePrice = false } = {}) {
  const skuSet = new Set(products.map((p) => p.productSkuCode));

  const validSimple = products.filter((p) => {
    if (p.productType !== 'simple') return false;
    // Never store a variant with no stock, no real color, or no real size.
    if ((Number(p.currentStockCount) || 0) <= 0) return false;
    if (!String(p.color || '').trim() || !String(p.size || '').trim()) return false;
    if (!requirePriceAndImage) return true;
    if (requirePrice && !((p.price || 0) > 0)) return false;
    return String(p.primaryImageUrl || '').trim();
  });

  const parentSkus = new Set(validSimple.map((p) => p.parentProductSkuCode).filter((sku) => sku && skuSet.has(sku)));

  const keptSimple = validSimple.filter((p) => !p.parentProductSkuCode || parentSkus.has(p.parentProductSkuCode));

  const grandParentSkus = new Set(
    products
      .filter((p) => parentSkus.has(p.productSkuCode))
      .map((p) => p.grandParentProductSkuCode)
      .filter((sku) => sku && skuSet.has(sku))
  );

  return products.filter((p) => {
    if (p.productType === 'simple') {
      return keptSimple.some((s) => s.productSkuCode === p.productSkuCode);
    }
    if (p.grandParentProductSkuCode) {
      return parentSkus.has(p.productSkuCode);
    }
    return grandParentSkus.has(p.productSkuCode);
  });
}

/** Grandparent → parent (color) → child (size), grouped by product family */
export function sortProductsByHierarchy(products) {
  const level = (p) => {
    if (p.parentProductSkuCode) return 2;
    if (p.grandParentProductSkuCode) return 1;
    return 0;
  };

  const rootSku = (p) => {
    if (p.grandParentProductSkuCode) return p.grandParentProductSkuCode;
    if (p.parentProductSkuCode) {
      const dash = p.parentProductSkuCode.indexOf('-');
      return dash > 0 ? p.parentProductSkuCode.slice(0, dash) : p.parentProductSkuCode;
    }
    return p.productSkuCode;
  };

  return [...products].sort((a, b) => {
    const rootDiff = rootSku(a).localeCompare(rootSku(b));
    if (rootDiff) return rootDiff;

    const levelDiff = level(a) - level(b);
    if (levelDiff) return levelDiff;

    const parentDiff = (a.parentProductSkuCode || '').localeCompare(b.parentProductSkuCode || '');
    if (parentDiff) return parentDiff;

    return (a.productSkuCode || '').localeCompare(b.productSkuCode || '');
  });
}

export function sortProductsByInterleavedHierarchy(products) {
  const bySku = (a, b) => (a.productSkuCode || '').localeCompare(b.productSkuCode || '');

  const grandparents = products.filter((p) => !p.parentProductSkuCode && !p.grandParentProductSkuCode).sort(bySku);

  const result = [];

  for (const gp of grandparents) {
    result.push(gp);

    const parents = products
      .filter((p) => p.grandParentProductSkuCode === gp.productSkuCode && !p.parentProductSkuCode)
      .sort(bySku);

    for (const parent of parents) {
      result.push(parent);

      const children = products.filter((p) => p.parentProductSkuCode === parent.productSkuCode).sort(bySku);
      result.push(...children);
    }
  }

  const included = new Set(result.map((p) => p.productSkuCode));
  const orphans = products.filter((p) => !included.has(p.productSkuCode)).sort(bySku);
  if (orphans.length) result.push(...orphans);

  return result;
}
