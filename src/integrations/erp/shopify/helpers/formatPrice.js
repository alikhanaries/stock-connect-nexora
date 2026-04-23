export const formatShopifyPrice = (rawProducts = [], sellerId) => {
  if (!rawProducts.length) return { products: [] };

  const products = [];

  for (const product of rawProducts) {
    const { id, variants = [] } = product;
    if (!variants.length) continue;

    const grandParentSku = String(id);

    const groupedByColor = {};
    for (const variant of variants) {
      const color = variant.color || 'DEFAULT';
      if (!groupedByColor[color]) groupedByColor[color] = [];
      groupedByColor[color].push(variant);
    }

    const grandParentPrice = Number(variants[0]?.price) || 0;

    products.push({
      sellerId,
      productSkuCode: grandParentSku,
      price: grandParentPrice,
      noonPrice: grandParentPrice,
      namshiPrice: grandParentPrice,
      purchasePrice: grandParentPrice,
      msrp: grandParentPrice,
      minPrice: null,
      maxPrice: null,
    });

    for (const [color, colorVariants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      const parentPrice = Number(colorVariants[0]?.price) || 0;

      products.push({
        sellerId,
        productSkuCode: parentSku,
        price: parentPrice,
        noonPrice: parentPrice,
        namshiPrice: parentPrice,
        purchasePrice: parentPrice,
        msrp: parentPrice,
        minPrice: null,
        maxPrice: null,
      });

      for (const variant of colorVariants) {
        const size = variant.size || '';
        const childSku =
          variant.sku ||
          variant.id ||
          (size ? `${parentSku}-${size.replace(/\s+/g, '_').toUpperCase()}` : `${parentSku}-${variant.id}`);

        const childPrice = Number(variant.price) || 0;

        products.push({
          sellerId,
          productSkuCode: childSku,
          price: childPrice,
          noonPrice: childPrice,
          namshiPrice: childPrice,
          purchasePrice: childPrice,
          msrp: childPrice,
          minPrice: null,
          maxPrice: null,
        });
      }
    }
  }

  return { products };
};
