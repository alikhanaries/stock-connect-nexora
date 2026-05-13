import { convertCodeFormat } from './commonHelper.js';
import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';

export const formatEntegraPrice = async (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const baseSku = convertCodeFormat(p.productCode);
    if (!baseSku) continue;

    const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';

    const parentPrice = await priceConverter(currency, parseFloat(p.namshi_fiyat) || 0);
    const parentSpecial = await priceConverter(currency, parseFloat(p.site_indirimli_fiyat) || 0);

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

      const childPrice = await priceConverter(currency, parseFloat(v.namshi_fiyat) || 0);
      const childSpecial = await priceConverter(currency, parseFloat(v.site_indirimli_fiyat) || 0);

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
