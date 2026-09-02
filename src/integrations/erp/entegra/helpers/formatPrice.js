import { convertCodeFormat, convertEntegraPrice } from './commonHelper.js';

export const formatEntegraPrice = async (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const baseSku = convertCodeFormat(p.productCode);
    if (!baseSku) continue;

    const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';

    const parentPrice = await convertEntegraPrice(currency, p.namshi_fiyat);
    const parentSpecial = await convertEntegraPrice(currency, p.site_indirimli_fiyat);

    result.push({
      sellerId,
      productSkuCode: baseSku,
      price: parentPrice,
      noonPrice: parentPrice,
      namshiPrice: parentPrice,
      msrp: parentPrice,
      minPrice: parentSpecial || null,
      maxPrice: parentPrice,
      purchasePrice: parentPrice,
    });

    const variations = Array.isArray(p.variatios) ? p.variatios : [];

    for (const v of variations) {
      const childSku = convertCodeFormat(v.productCode);
      if (!childSku) continue;

      const childPrice = await convertEntegraPrice(currency, v.namshi_fiyat);
      const childSpecial = await convertEntegraPrice(currency, v.site_indirimli_fiyat);

      result.push({
        sellerId,
        productSkuCode: childSku,
        price: childPrice,
        noonPrice: childPrice,
        namshiPrice: childPrice,
        msrp: childPrice,
        minPrice: childSpecial || null,
        maxPrice: childPrice,
        purchasePrice: childPrice,
      });
    }
  }

  return { products: result };
};
