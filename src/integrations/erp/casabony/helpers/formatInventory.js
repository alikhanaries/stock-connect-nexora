import { MIN_STOCK } from '../constants/common.js';

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const normalize = (val) => (val || '').trim().toUpperCase();
const safe = (val, fallback) => normalize(val || fallback).replace(/\s+/g, '_');

export const formatCasabonyInventory = (raw = [], sellerId) => {
  if (!raw.length) return { products: [] };

  const products = [];

  for (const item of raw) {
    const baseSku = normalize(item.OzelAlan1 || item.UrunKartiID);
    if (!baseSku) continue;

    const subProducts = toArray(item?.UrunSecenek?.Secenek);
    let totalStock = 0;

    const groupedByColor = subProducts.reduce((acc, variant) => {
      const ozellikler = toArray(variant?.EkSecenekOzellik?.Ozellik);
      const colorObj = ozellikler.find((o) => o.$?.Tanim === 'Renk');
      const color = normalize(colorObj?._ || '');
      (acc[color] ||= []).push(variant);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const parentSku = color ? `${baseSku}-${safe(color, '')}` : baseSku;
      let parentStock = 0;

      for (const v of variants) {
        const ozellikler = toArray(v?.EkSecenekOzellik?.Ozellik);
        const sizeObj = ozellikler.find((o) => o.$?.Tanim === 'Beden');
        const size = safe(sizeObj?._, '');

        const childSku = normalize(v.StokKodu || (size ? `${parentSku}-${size}` : parentSku));

        const stock = Number(v.StokAdedi || 0);
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
