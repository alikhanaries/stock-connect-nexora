import { MIN_STOCK } from '../constants/common.js';

const normalize = (val) => (val || '').toString().trim();

export const formatExquiseInventory = (raw = [], sellerId) => {
  if (!Array.isArray(raw) || !raw.length) return { products: [] };

  const groupedByItemCode = raw.reduce((acc, item) => {
    const code = normalize(item.ItemCode);

    if (!code) return acc;

    (acc[code] ||= []).push(item);

    return acc;
  }, {});

  const products = [];

  for (const [itemCode, items] of Object.entries(groupedByItemCode)) {
    let grandParentStock = 0;

    const groupedByColor = items.reduce((acc, item) => {
      const colorCode = normalize(item.ColorCode) || '0';

      (acc[colorCode] ||= []).push(item);

      return acc;
    }, {});

    for (const [colorCode, variants] of Object.entries(groupedByColor)) {
      const parentSku = `${itemCode}_${colorCode}`;

      let parentStock = 0;

      for (const variant of variants) {
        const sizeCode = normalize(variant.ItemDim1Code) || '0';

        const childSku = `${itemCode}_${colorCode}_${sizeCode}`;

        const stock = Number(variant.Qty || 0);

        parentStock += stock;
        grandParentStock += stock;

        products.push({
          sellerId,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          currentStockCount: stock,
          status: stock < MIN_STOCK ? 'inactive' : 'active',
          updatedAt: new Date(),
        });
      }

      // parent(color-level)
      products.push({
        sellerId,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: itemCode,
        productType: 'configurable',
        currentStockCount: parentStock,
        status: parentStock < MIN_STOCK ? 'inactive' : 'active',
        updatedAt: new Date(),
      });
    }

    // grandparent(item-level)
    products.push({
      sellerId,
      productSkuCode: itemCode,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      currentStockCount: grandParentStock,
      status: grandParentStock < MIN_STOCK ? 'inactive' : 'active',
      updatedAt: new Date(),
    });
  }

  return { products };
};
