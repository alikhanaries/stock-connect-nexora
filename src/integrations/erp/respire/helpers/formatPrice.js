import {
  convertCodeFormat,
  convertRespirePrice,
  normalizeAndTranslateVariants,
  buildSkuHierarchy,
  buildChildSku,
} from './commonHelper.js';

// Respire has no Namshi/Noon/Amazon/6thStreet/Styli fields (different marketplace set
// than Entegra) — price comes from Respire's own site price + site discount price,
// and purchasePrice comes from Respire's actual buying_price (cost) field. Mirrors the
// same color-grouping / SKU derivation as helpers/formatter.js so price sync targets
// the exact same SKUs that product sync created.
export const formatRespirePrice = async (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const currency = p.currencyType === 'TRL' ? 'TRY' : p.currencyType || 'USD';
    const variations = Array.isArray(p.variatios) ? p.variatios : [];

    const rootPrice = await convertRespirePrice(currency, p.site_fiyati);
    const rootSpecial = await convertRespirePrice(currency, p.site_indirimli_fiyati);
    const rootPurchasePrice = (await convertRespirePrice(currency, p.buying_price)) || rootPrice;

    if (!variations.length) {
      const baseSku = convertCodeFormat(p.productCode);
      if (!baseSku) continue;

      result.push({
        sellerId,
        productSkuCode: baseSku,
        price: rootPrice,
        noonPrice: 0,
        namshiPrice: 0,
        amazonPrice: 0,
        sixthStreetPrice: 0,
        styliPrice: 0,
        msrp: rootPrice,
        minPrice: rootSpecial || null,
        maxPrice: rootPrice,
        purchasePrice: rootPurchasePrice,
      });
      continue;
    }

    const normalizedVariants = await normalizeAndTranslateVariants(variations);
    const variantsByColor = normalizedVariants.reduce((acc, v) => {
      if (!v.normalizedColor) return acc;
      acc[v.normalizedColor] ||= [];
      acc[v.normalizedColor].push(v);
      return acc;
    }, {});

    for (const [color, colorVariants] of Object.entries(variantsByColor)) {
      const { parentSku } = buildSkuHierarchy(p.productCode, colorVariants[0]?.originalColor || color);

      result.push({
        sellerId,
        productSkuCode: parentSku,
        price: rootPrice,
        noonPrice: 0,
        namshiPrice: 0,
        amazonPrice: 0,
        sixthStreetPrice: 0,
        styliPrice: 0,
        msrp: rootPrice,
        minPrice: rootSpecial || null,
        maxPrice: rootPrice,
        purchasePrice: rootPurchasePrice,
      });

      for (const v of colorVariants) {
        const childSku = buildChildSku(parentSku, v.normalizedSize || v.originalSize);
        if (!childSku) continue;

        // Respire never populates per-variant prices (confirmed against live data) —
        // fall back to the parent/root-level price when the variant's own is 0.
        const childPrice = (await convertRespirePrice(currency, v.site_fiyati)) || rootPrice;
        const childSpecial = (await convertRespirePrice(currency, v.site_indirimli_fiyati)) || rootSpecial;
        const childPurchasePrice = (await convertRespirePrice(currency, v.buying_price)) || rootPurchasePrice;

        result.push({
          sellerId,
          productSkuCode: childSku,
          price: childPrice,
          noonPrice: 0,
          namshiPrice: 0,
          amazonPrice: 0,
          sixthStreetPrice: 0,
          styliPrice: 0,
          msrp: childPrice,
          minPrice: childSpecial || null,
          maxPrice: childPrice,
          purchasePrice: childPurchasePrice,
        });
      }
    }
  }

  return { products: result };
};
