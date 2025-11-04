import Product from '#models/Product.js';

export function determineProductType(product) {
  const hasParent = !!product.parentProductSkuCode?.trim();
  const hasGrandParent = !!product.grandParentProductSkuCode?.trim();

  if (!hasParent && !hasGrandParent) return 'configurable'; // grandparent
  if (!hasParent && hasGrandParent) return 'configurable'; // parent
  if (hasParent && !hasGrandParent) return 'simple'; // child

  throw new Error(
    `Invalid hierarchy for SKU '${product.productSkuCode}'. A product cannot have both parent and grandparent.`
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
  const sheetSkus = new Set(products.map((p) => p.productSkuCode).filter(Boolean));
  const refsToCheck = new Set();

  for (const p of products) {
    if (p.parentProductSkuCode && !sheetSkus.has(p.parentProductSkuCode)) refsToCheck.add(p.parentProductSkuCode);
    if (p.grandParentProductSkuCode && !sheetSkus.has(p.grandParentProductSkuCode))
      refsToCheck.add(p.grandParentProductSkuCode);
  }

  let dbExistingSkus = new Set();

  if (refsToCheck.size > 0) {
    const dbProducts = await Product.find(
      { sellerId, productSkuCode: { $in: [...refsToCheck] } },
      { productSkuCode: 1 }
    ).lean();

    dbExistingSkus = new Set(dbProducts.map((p) => p.productSkuCode));
  }

  const validated = [];

  for (const product of products) {
    const rowErrors = [];
    const { productSkuCode, parentProductSkuCode, grandParentProductSkuCode } = product;
    if (parentProductSkuCode) {
      const parentExists = sheetSkus.has(parentProductSkuCode) || dbExistingSkus.has(parentProductSkuCode);
      if (!parentExists) {
        rowErrors.push(
          `Parent SKU '${parentProductSkuCode}' not found for '${productSkuCode}'. Please upload the parent first.`
        );
      }
    }
    if (grandParentProductSkuCode) {
      const gpExists = sheetSkus.has(grandParentProductSkuCode) || dbExistingSkus.has(grandParentProductSkuCode);
      if (!gpExists) {
        rowErrors.push(
          `Grandparent SKU '${grandParentProductSkuCode}' not found for '${productSkuCode}'. Please upload the grandparent first.`
        );
      }
    }
    validated.push({
      product,
      valid: rowErrors.length === 0,
      errors: rowErrors,
    });
    if (rowErrors.length > 0) {
      errors.push({ rowNumber: product.rowNumber || '-', errorData: rowErrors });
    }
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
