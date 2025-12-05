import Product from '#models/Product.js';

/**
 * Determines whether a product is 'configurable' or 'simple'.
 * Logic is based purely on its parent / grandparent relationships.
 */
export function determineProductType(product) {
  const parent = product.parentProductSkuCode;
  const grand = product.grandParentProductSkuCode;

  // No parent or grandparent → top-level product → configurable
  if (!parent && !grand) return 'configurable';

  // Has grandparent but no parent → still a parent of others → configurable
  if (!parent && grand) return 'configurable';

  // Has a parent but no grandparent → leaf node → simple product
  if (parent && !grand) return 'simple';

  // Invalid: a child cannot have both a parent and grandparent
  throw new Error(`Invalid hierarchy for SKU '${product.productSkuCode}' (Row ${product.rowNumber}).`);
}

/**
 * Performs basic structure checks:
 * - no self-references
 * - no identical parent & grandparent
 * - simple products cannot have both
 */
export function validateHierarchy(product) {
  const errors = [];
  const sku = product.productSkuCode;
  const parent = product.parentProductSkuCode;
  const grand = product.grandParentProductSkuCode;

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
  const validated = new Array(products.length);

  // All SKUs in current sheet for quick lookup
  const sheetSkuSet = new Set(products.map((p) => p.productSkuCode));

  // Collect all referenced parent/grandparent SKUs not in sheet
  const missingRefs = new Set();
  for (const p of products) {
    if (p.parentProductSkuCode && !sheetSkuSet.has(p.parentProductSkuCode)) missingRefs.add(p.parentProductSkuCode);

    if (p.grandParentProductSkuCode && !sheetSkuSet.has(p.grandParentProductSkuCode))
      missingRefs.add(p.grandParentProductSkuCode);
  }

  // Fetch missing references from the database
  let dbSkuSet = new Set();
  if (missingRefs.size > 0) {
    const dbProducts = await Product.find(
      { sellerId, productSkuCode: { $in: [...missingRefs] } },
      { productSkuCode: 1 }
    ).lean();
    dbSkuSet = new Set(dbProducts.map((p) => p.productSkuCode));
  }

  // Validate each row against sheet + DB SKU sets
  let vIndex = 0;
  for (const p of products) {
    const rowErrors = [];

    // Parent must exist somewhere
    if (p.parentProductSkuCode && !sheetSkuSet.has(p.parentProductSkuCode) && !dbSkuSet.has(p.parentProductSkuCode)) {
      rowErrors.push(`Parent SKU '${p.parentProductSkuCode}' not found for '${p.productSkuCode}'.`);
    }

    // Grandparent must exist somewhere
    if (
      p.grandParentProductSkuCode &&
      !sheetSkuSet.has(p.grandParentProductSkuCode) &&
      !dbSkuSet.has(p.grandParentProductSkuCode)
    ) {
      rowErrors.push(`Grandparent SKU '${p.grandParentProductSkuCode}' not found for '${p.productSkuCode}'.`);
    }

    const valid = rowErrors.length === 0;
    if (!valid) errors.push({ rowNumber: p.rowNumber, errorData: rowErrors });

    validated[vIndex++] = { product: p, valid, errors: rowErrors };
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
  const refs = await Product.aggregate([
    { $match: { sellerId } },
    {
      $group: {
        _id: null,
        parentRefs: { $addToSet: '$parentProductSkuCode' },
        grandRefs: { $addToSet: '$grandParentProductSkuCode' },
      },
    },
    // Merge parent + grandparent references
    { $project: { refs: { $setUnion: ['$parentRefs', '$grandRefs'] } } },
  ]);

  const refList = refs[0]?.refs?.filter(Boolean) || [];

  if (refList.length > 0) {
    // All referenced SKUs are configurable
    await Product.updateMany({ sellerId, productSkuCode: { $in: refList } }, { $set: { productType: 'configurable' } });

    // Everything else is simple
    await Product.updateMany({ sellerId, productSkuCode: { $nin: refList } }, { $set: { productType: 'simple' } });
  }
}
