import Product from '#models/Product.js';

export function determineProductType(product) {
  const hasParent = !!product.parentProductSkuCode?.trim();
  const hasGrandParent = !!product.grandParentProductSkuCode?.trim();

  // Grandparent (top-level)
  if (!hasParent && !hasGrandParent) return 'configurable';

  // Parent (has grandparent reference)
  if (!hasParent && hasGrandParent) return 'configurable';

  // Child (has parent only)
  if (hasParent && !hasGrandParent) return 'simple';

  // Invalid combination (both set)
  const rowInfo = product.rowNumber ? ` (Row ${product.rowNumber})` : '';
  throw new Error(
    `Invalid hierarchy for SKU '${product.productSkuCode}'${rowInfo}. A product cannot have both parent and grandparent.`
  );
}

export function validateHierarchy(product) {
  const errors = [];
  const { productSkuCode, parentProductSkuCode, grandParentProductSkuCode } = product;
  if (productSkuCode && (productSkuCode === parentProductSkuCode || productSkuCode === grandParentProductSkuCode)) {
    errors.push(`SKU '${productSkuCode}' cannot reference itself as parent or grandparent.`);
  }
  if (parentProductSkuCode && grandParentProductSkuCode && parentProductSkuCode === grandParentProductSkuCode) {
    errors.push(`SKU '${productSkuCode}' cannot have the same parent and grandparent ('${parentProductSkuCode}').`);
  }
  if (parentProductSkuCode && grandParentProductSkuCode) {
    errors.push(`Child SKU '${productSkuCode}' should reference only a parent — not both parent and grandparent.`);
  }
  return { valid: errors.length === 0, errors };
}

export async function validateHierarchyExistenceBatch(products, sellerId) {
  const errors = [];
  const validated = [];

  // Build reference sets
  const allSheetSkus = new Set(products.map((p) => p.productSkuCode).filter(Boolean));
  const refSkus = new Set();

  for (const p of products) {
    if (p.parentProductSkuCode && !allSheetSkus.has(p.parentProductSkuCode)) {
      refSkus.add(p.parentProductSkuCode);
    }
    if (p.grandParentProductSkuCode && !allSheetSkus.has(p.grandParentProductSkuCode)) {
      refSkus.add(p.grandParentProductSkuCode);
    }
  }

  // Fetch all referenced SKUs from DB in one query
  let dbSkuSet = new Set();
  if (refSkus.size > 0) {
    const dbProducts = await Product.find(
      { sellerId, productSkuCode: { $in: [...refSkus] } },
      { productSkuCode: 1 }
    ).lean();
    dbSkuSet = new Set(dbProducts.map((p) => p.productSkuCode));
  }

  // Validate each product
  for (const product of products) {
    const rowErrors = [];

    if (
      product.parentProductSkuCode &&
      !allSheetSkus.has(product.parentProductSkuCode) &&
      !dbSkuSet.has(product.parentProductSkuCode)
    ) {
      rowErrors.push(
        `Parent SKU '${product.parentProductSkuCode}' not found for '${product.productSkuCode}' (Row ${product.rowNumber}).`
      );
    }

    if (
      product.grandParentProductSkuCode &&
      !allSheetSkus.has(product.grandParentProductSkuCode) &&
      !dbSkuSet.has(product.grandParentProductSkuCode)
    ) {
      rowErrors.push(
        `Grandparent SKU '${product.grandParentProductSkuCode}' not found for '${product.productSkuCode}' (Row ${product.rowNumber}).`
      );
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber: product.rowNumber || '-', errorData: rowErrors });
    }
    validated.push({
      product,
      valid: rowErrors.length === 0,
      errors: rowErrors,
    });
  }
  return { validated, errors };
}

export async function resolveProductTypes(sellerId) {
  const parentRefs = await Product.distinct('parentProductSkuCode', { sellerId });
  const grandParentRefs = await Product.distinct('grandParentProductSkuCode', { sellerId });
  const configurables = [...new Set([...parentRefs, ...grandParentRefs])].filter(Boolean);
  if (configurables.length > 0) {
    await Product.updateMany(
      { sellerId, productSkuCode: { $in: configurables } },
      { $set: { productType: 'configurable' } }
    );
  }

  await Product.updateMany({ sellerId, productSkuCode: { $nin: configurables } }, { $set: { productType: 'simple' } });
}
