import { safeNumber, convertCodeFormat } from './commonHelper.js';

export const formatEntegraInventory = (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const baseSku = convertCodeFormat(p.productCode);

    if (!baseSku) continue;

    let totalStock = 0;

    const variations = Array.isArray(p.variatios) ? p.variatios : [];

    for (const v of variations) {
      const childSku = convertCodeFormat(v.productCode);

      const stock = safeNumber(v.quantity);

      totalStock += stock;

      result.push({
        sellerId,
        productSkuCode: childSku,
        parentProductSkuCode: baseSku,
        grandParentProductSkuCode: null,
        productType: 'simple',
        currentStockCount: stock,
        status: stock > 0 ? 'active' : 'inactive',
        updatedAt: new Date(),
      });
    }

    // Parent level stock
    result.push({
      sellerId,
      productSkuCode: baseSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      currentStockCount: totalStock,
      status: totalStock > 0 ? 'active' : 'inactive',
      updatedAt: new Date(),
    });
  }

  return { products: result };
};
