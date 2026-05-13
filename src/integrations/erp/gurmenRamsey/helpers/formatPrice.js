const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const normalize = (val) => (val || '').trim().toUpperCase();
const safe = (val, fallback) => normalize(val || fallback).replace(/\s+/g, '_');

const parsePrice = (val) => {
  const n = parseFloat(val || 0);
  return isNaN(n) ? 0 : n;
};

export const formatRamseyPrice = (raw = [], sellerId) => {
  if (!raw.length) return { products: [] };

  const products = [];

  for (const item of raw) {
    const baseSku = normalize(item.ws_code);
    if (!baseSku) continue;

    const price = parsePrice(item.price_special);
    const priceFields = {
      price,
      noonPrice: price,
      namshiPrice: price,
      purchasePrice: price,
      msrp: price,
      minPrice: null,
      maxPrice: null,
    };

    const subProducts = toArray(item?.subproducts?.subproduct);

    products.push({
      sellerId,
      productSkuCode: baseSku,
      ...priceFields,
    });

    const groupedByColor = subProducts.reduce((acc, variant) => {
      const color = normalize(variant.color || variant.color_drop) || 'DEFAULT';
      (acc[color] ||= []).push(variant);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const parentSku = `${baseSku}-${safe(color, 'DEFAULT')}`;

      products.push({
        sellerId,
        productSkuCode: parentSku,
        ...priceFields,
      });

      for (const v of variants) {
        const size = safe(v.size, 'NOSIZE');
        const childSku = `${parentSku}-${size}`;

        products.push({
          sellerId,
          productSkuCode: childSku,
          ...priceFields,
        });
      }
    }
  }

  return { products };
};
