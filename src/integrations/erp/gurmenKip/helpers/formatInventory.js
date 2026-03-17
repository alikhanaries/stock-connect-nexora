export const formatInventory = (raw = [], sellerId) => {
  if (!raw.length) return { products: [] };

  const products = [];

  for (const p of raw) {
    const baseSku = (p.ws_code || p.code || '').trim().toUpperCase();
    if (!baseSku) continue;

    const subproducts = Array.isArray(p?.subproducts?.subproduct) ? p.subproducts.subproduct : [];

    let totalStock = 0;
    const baseProduct = {
      sellerId,
      productSkuCode: baseSku,
      productType: 'configurable',
      currentStockCount: 0,
      status: 'inactive',
      updatedAt: new Date(),
    };

    products.push(baseProduct);

    const groupedByColor = {};

    for (const v of subproducts) {
      const color = (v.color || v.color_drop || '').trim() || 'DEFAULT';
      (groupedByColor[color] ||= []).push(v);
    }

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${baseSku}-${safeColor}`;

      let parentStock = 0;

      for (const v of variants) {
        const size = (v.size || '').trim() || 'NOSIZE';
        const safeSize = size.replace(/\s+/g, '_').toUpperCase();

        const childSku = `${parentSku}-${safeSize}`;

        const stock = Number(v.stock || 0);
        parentStock += stock;
        totalStock += stock;

        products.push({
          sellerId,
          productSkuCode: childSku,
          productType: 'simple',
          currentStockCount: stock,
          status: stock > 0 ? 'active' : 'inactive',
          updatedAt: new Date(),
        });
      }

      products.push({
        sellerId,
        productSkuCode: parentSku,
        productType: 'configurable',
        currentStockCount: parentStock,
        status: parentStock > 0 ? 'active' : 'inactive',
        updatedAt: new Date(),
      });
    }

    baseProduct.currentStockCount = totalStock;
    baseProduct.status = totalStock > 0 ? 'active' : 'inactive';
  }

  return { products };
};
