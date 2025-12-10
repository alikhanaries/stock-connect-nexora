import Product from '#models/Product.js';

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
  const results = await Product.aggregate([
    { $match: { sellerId } },
    {
      $group: {
        _id: null,
        parents: { $addToSet: '$parentProductSkuCode' },
        grands: { $addToSet: '$grandParentProductSkuCode' },
      },
    },
    { $project: { refs: { $setUnion: ['$parents', '$grands'] } } },
  ]);

  const refs = results[0]?.refs?.filter(Boolean) || [];

  // Configurable = Appears in refs
  await Product.updateMany({ sellerId, productSkuCode: { $in: refs } }, { $set: { productType: 'configurable' } });

  // Simple = Not referenced anywhere
  await Product.updateMany({ sellerId, productSkuCode: { $nin: refs } }, { $set: { productType: 'simple' } });
}
