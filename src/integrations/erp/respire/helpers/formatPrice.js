import {
  mapRespireChannelPrices,
  normalizeAndTranslateVariants,
  buildSkuHierarchy,
  buildChildSku,
} from './commonHelper.js';

const toPriceRecord = (sellerId, productSkuCode, prices) => ({
  sellerId,
  productSkuCode,
  price: prices.price,
  noonPrice: prices.noonPrice,
  namshiPrice: prices.namshiPrice,
  amazonPrice: prices.amazonPrice,
  sixthStreetPrice: prices.sixthStreetPrice,
  styliPrice: prices.styliPrice,
  msrp: prices.price,
  minPrice: prices.specialPrice || null,
  maxPrice: prices.price,
  purchasePrice: prices.purchasePrice,
});

// Mirrors the same color-grouping / SKU derivation as helpers/formatter.js so price sync
// targets the exact same SKUs that product sync created. Channel prices (olltek/noon/
// amazon_sa/sixth_street/styli) live only on the root product, so every parent and child
// SKU inherits them from the root.
export const formatRespirePrice = async (products = [], sellerId) => {
  if (!products.length) return { products: [] };

  const result = [];

  for (const p of products) {
    const variations = Array.isArray(p.variatios) ? p.variatios : [];

    const rootPrices = mapRespireChannelPrices(p);

    if (!variations.length) {
      const baseSku = p.productCode;
      if (!baseSku) continue;

      result.push(toPriceRecord(sellerId, baseSku, rootPrices));
      continue;
    }

    const normalizedVariants = await normalizeAndTranslateVariants(variations);
    const variantsByColor = normalizedVariants.reduce((acc, v) => {
      if (!v.normalizedColor) return acc;
      acc[v.normalizedColor] ||= [];
      acc[v.normalizedColor].push(v);
      return acc;
    }, {});

    const grandParentSkus = new Set();

    for (const [color, colorVariants] of Object.entries(variantsByColor)) {
      const { grandParentSku, parentSku } = buildSkuHierarchy(p.productCode, colorVariants[0]?.originalColor || color);

      if (!grandParentSkus.has(grandParentSku)) {
        grandParentSkus.add(grandParentSku);
        result.push(toPriceRecord(sellerId, grandParentSku, rootPrices));
      }

      result.push(toPriceRecord(sellerId, parentSku, rootPrices));

      for (const v of colorVariants) {
        const childSku = buildChildSku(parentSku, v.normalizedSize || v.originalSize);
        if (!childSku) continue;

        // Respire never populates per-variant prices (confirmed against live data) —
        // each price falls back to the parent's when the variant's own is 0.
        const childPrices = mapRespireChannelPrices(v, rootPrices);
        result.push(toPriceRecord(sellerId, childSku, childPrices));
      }
    }
  }

  return { products: result };
};
