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
    const parentNoonPrice = await convertEntegraPrice(currency, p.noon_ot);
    const parentAmazonPrice = await convertEntegraPrice(currency, p.amazon_ot);
    const parentSixthStreetPrice = await convertEntegraPrice(currency, p.thstreet6_ot);
    const parentStyliPrice = await convertEntegraPrice(currency, p.styli_ot);

    result.push({
      sellerId,
      productSkuCode: baseSku,
      price: parentPrice,
      noonPrice: parentNoonPrice || 0,
      namshiPrice: parentPrice,
      amazonPrice: parentAmazonPrice || 0,
      sixthStreetPrice: parentSixthStreetPrice || 0,
      styliPrice: parentStyliPrice || 0,
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
      const childNoonPrice = await convertEntegraPrice(currency, v.noon_ot);
      const childAmazonPrice = await convertEntegraPrice(currency, v.amazon_ot);
      const childSixthStreetPrice = await convertEntegraPrice(currency, v.thstreet6_ot);
      const childStyliPrice = await convertEntegraPrice(currency, v.styli_ot);

      result.push({
        sellerId,
        productSkuCode: childSku,
        price: childPrice,
        noonPrice: childNoonPrice || 0,
        namshiPrice: childPrice,
        amazonPrice: childAmazonPrice || 0,
        sixthStreetPrice: childSixthStreetPrice || 0,
        styliPrice: childStyliPrice || 0,
        msrp: childPrice,
        minPrice: childSpecial || null,
        maxPrice: childPrice,
        purchasePrice: childPrice,
      });
    }
  }

  return { products: result };
};
