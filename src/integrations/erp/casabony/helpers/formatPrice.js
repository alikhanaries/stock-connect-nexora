const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const normalize = (val) => (val || '').trim().toUpperCase();
const safe = (val, fallback) => normalize(val || fallback).replace(/\s+/g, '_');

export const formatCasabonyPrice = (raw = [], sellerId) => {
  if (!raw.length) return { products: [] };

  const products = [];

  for (const item of raw) {
    const baseSku = normalize(item.OzelAlan1 || item.UrunKartiID);
    if (!baseSku) continue;

    const priceSpecial = parseFloat(item.IndirimliFiyati || item.SatisFiyati || 0);

    const basePriceData = {
      price: priceSpecial,
      noonPrice: priceSpecial,
      namshiPrice: priceSpecial,
      purchasePrice: priceSpecial,
      msrp: priceSpecial,
    };

    const subProducts = toArray(item?.UrunSecenek?.Secenek);

    const groupedByColor = subProducts.reduce((acc, variant) => {
      const ozellikler = toArray(variant?.EkSecenekOzellik?.Ozellik);
      const colorObj = ozellikler.find((o) => o.$?.Tanim === 'Renk');
      const color = normalize(colorObj?._ || '');
      (acc[color] ||= []).push(variant);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const parentSku = color ? `${baseSku}-${safe(color, '')}` : baseSku;

      for (const v of variants) {
        const ozellikler = toArray(v?.EkSecenekOzellik?.Ozellik);
        const sizeObj = ozellikler.find((o) => o.$?.Tanim === 'Beden');
        const size = safe(sizeObj?._, '');

        const childSku = normalize(v.StokKodu || (size ? `${parentSku}-${size}` : parentSku));

        const childPrice = parseFloat(v.IndirimliFiyati || v.SatisFiyati || priceSpecial);

        products.push({
          sellerId,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          price: childPrice,
          noonPrice: childPrice,
          namshiPrice: childPrice,
          purchasePrice: childPrice,
          msrp: childPrice,
          updatedAt: new Date(),
        });
      }

      products.push({
        sellerId,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: baseSku,
        productType: 'configurable',
        ...basePriceData,
        updatedAt: new Date(),
      });
    }

    products.push({
      sellerId,
      productSkuCode: baseSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      ...basePriceData,
      updatedAt: new Date(),
    });
  }

  return { products };
};
