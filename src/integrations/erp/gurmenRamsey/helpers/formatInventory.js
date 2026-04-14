import { MIN_STOCK } from '#root/src/integrations/erp/gurmenRamsey/constants/common.js';

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const normalize = (val) => (val || '').trim().toUpperCase();
const safe = (val, fallback) => normalize(val || fallback).replace(/\s+/g, '_');

export const formatRamseyInventory = (raw = [], sellerId) => {
  if (!raw.length) return { products: [] };

  const products = [];

  for (const item of raw) {
    const baseSku = normalize(item.ws_code);
    if (!baseSku) continue;

    const subProducts = toArray(item?.subproducts?.subproduct);
    let totalStock = 0;

    const groupedByColor = subProducts.reduce((acc, variant) => {
      const color = normalize(variant.color || variant.color_drop) || 'DEFAULT';
      (acc[color] ||= []).push(variant);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const parentSku = `${baseSku}-${safe(color, 'DEFAULT')}`;
      let parentStock = 0;

      for (const v of variants) {
        const size = safe(v.size, 'NOSIZE');
        const childSku = `${parentSku}-${size}`;

        const stock = Number(v.stock || 0);
        parentStock += stock;
        totalStock += stock;

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

      products.push({
        sellerId,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: baseSku,
        productType: 'configurable',
        currentStockCount: parentStock,
        status: parentStock < MIN_STOCK ? 'inactive' : 'active',
        updatedAt: new Date(),
      });
    }

    products.push({
      sellerId,
      productSkuCode: baseSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      currentStockCount: totalStock,
      status: totalStock < MIN_STOCK ? 'inactive' : 'active',
      updatedAt: new Date(),
    });
  }

  return { products };
};
