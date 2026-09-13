import { getWarehouseStock } from './stockHelper.js';

export const formatSentosInventoryRows = (items = [], sellerId) => {
  const products = [];

  for (const item of items) {
    const variants = Array.isArray(item.variants) ? item.variants : [];

    if (variants.length) {
      for (const variant of variants) {
        if (!variant?.sku) continue;
        const stock = getWarehouseStock(variant.stocks);
        products.push({
          sellerId,
          productSkuCode: variant.sku,
          currentStockCount: stock,
          status: stock > 0 ? 'active' : 'inactive',
        });
      }
      continue;
    }

    if (!item?.sku) continue;

    const stock = getWarehouseStock(item.stocks);
    products.push({
      sellerId,
      productSkuCode: item.sku,
      currentStockCount: stock,
      status: stock > 0 ? 'active' : 'inactive',
    });
  }

  return { products };
};
