import { safeNumber, normalizeAndTranslateVariants, buildSkuHierarchy, buildChildSku } from './commonHelper.js';

// Mirrors the same color-grouping / SKU derivation as helpers/formatter.js so
// inventory sync targets the exact same SKUs that product sync created.
export const formatRespireInventory = async (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const variations = Array.isArray(p.variatios) ? p.variatios : [];

    if (!variations.length) {
      const baseSku = p.productCode;
      if (!baseSku) continue;

      const stock = safeNumber(p.quantity);

      result.push({
        sellerId,
        productSkuCode: baseSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: null,
        productType: 'configurable',
        currentStockCount: stock,
        status: stock > 0 ? 'active' : 'inactive',
        updatedAt: new Date(),
      });
      continue;
    }

    const normalizedVariants = await normalizeAndTranslateVariants(variations);
    const variantsByColor = normalizedVariants.reduce((acc, v) => {
      if (!v.normalizedColor) return acc;
      acc[v.normalizedColor] ||= [];
      acc[v.normalizedColor].push(v);
      return acc;
    }, {});

    for (const [color, colorVariants] of Object.entries(variantsByColor)) {
      const { grandParentSku, parentSku } = buildSkuHierarchy(p.productCode, colorVariants[0]?.originalColor || color);

      let totalStock = 0;

      for (const v of colorVariants) {
        const childSku = buildChildSku(parentSku, v.normalizedSize || v.originalSize);
        const stock = safeNumber(v.quantity);
        totalStock += stock;

        result.push({
          sellerId,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          currentStockCount: stock,
          status: stock > 0 ? 'active' : 'inactive',
          updatedAt: new Date(),
        });
      }

      // Color-group level stock
      result.push({
        sellerId,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: grandParentSku,
        productType: 'configurable',
        currentStockCount: totalStock,
        status: totalStock > 0 ? 'active' : 'inactive',
        updatedAt: new Date(),
      });
    }
  }

  return { products: result };
};
