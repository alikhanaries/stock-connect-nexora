const toArray = (value) => (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []);
const cleanImages = (...imgGroups) => {
  const merged = imgGroups
    .flat()
    .filter(Boolean)
    .map((i) => i.trim());
  return [...new Set(merged)];
};
const extractSubproductImages = (subproducts) => {
  return subproducts.flatMap((sub) => {
    const items = toArray(sub.img_item);
    return cleanImages(sub.image_url, items);
  });
};

const formatBaseProduct = (product, sellerId, subproductImages) => {
  const imgItems = toArray(product.img_item).map((i) => i?.trim());
  const images = cleanImages(product.image_url, imgItems, subproductImages);

  return {
    sellerId,
    name: product.name,
    description: product.details,
    brand: product.brand,
    categoryTrail: product.category_path,
    vatRateType: 'STANDARD',
    status: product.active === '1' ? 'active' : 'inactive',
    primaryImageUrl: images[0] || null,
    imageUrl: images[0] || null,
    extraImageUrl1: images[1] || null,
    extraImageUrl2: images[2] || null,
    extraImageUrl3: images[3] || null,
    images,
    volumetricWeightCm: 0.3,
    hsCodeAE: product.code,
    hsCodeSA: product.code,
    updatedAt: new Date(),
  };
};

export const formatRamseyProduct = async (raw = [], sellerId) => {
  if (!Array.isArray(raw) || !raw.length) return [];

  const formatted = [];

  for (const product of raw) {
    const subproducts = toArray(product?.subproducts?.subproduct);
    const subproductImages = extractSubproductImages(subproducts);
    const base = {
      ...formatBaseProduct(product, sellerId, subproductImages),
    };
    const grandParentSku = product.ws_code || product.code;

    formatted.push({
      ...base,
      productSkuCode: grandParentSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      price: parseFloat(product.price_special) || 0,
      currentStockCount: subproducts.reduce((s, v) => s + Number(v.stock || 0), 0),
      color: '',
      size: '',
      ean: '',
    });

    if (!subproducts.length) continue;

    const groupedByColor = subproducts.reduce((acc, sub) => {
      const color = (sub.color || sub.color_drop || product.color_new || '').trim() || 'Default';
      (acc[color] ||= []).push(sub);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      formatted.push({
        ...base,
        productSkuCode: parentSku,
        parentProductSkuCode: null,
        grandParentProductSkuCode: grandParentSku,
        productType: 'configurable',
        color,
        size: '',
        ean: '',
        price: parseFloat(product.price_special),
        currentStockCount: variants.reduce((s, v) => s + Number(v.stock || 0), 0),
      });

      for (const variant of variants) {
        const size = (variant.size || '').trim() || 'NOSIZE';
        const safeSize = size.replace(/\s+/g, '_').toUpperCase();
        const childSku = `${parentSku}-${safeSize}`;
        const stock = Number(variant.stock || 0);
        if (stock <= 0) continue;
        const variantImgs = cleanImages(variant.image_url, toArray(variant.img_item));
        const mergedChildImages = cleanImages(base.images, variantImgs);
        formatted.push({
          ...base,
          productSkuCode: childSku,
          parentProductSkuCode: parentSku,
          grandParentProductSkuCode: null,
          productType: 'simple',
          primaryImageUrl: mergedChildImages[0] || null,
          imageUrl: mergedChildImages[0] || null,
          extraImageUrl1: mergedChildImages[1] || null,
          extraImageUrl2: mergedChildImages[2] || null,
          extraImageUrl3: mergedChildImages[3] || null,
          images: mergedChildImages,
          price: parseFloat(variant.price_special || product.price_special_vat_included),
          minPrice: null,
          maxPrice: null,
          msrp: parseFloat(variant.price_tl_vat_included_discount || product.price_special_vat_included),
          purchasePrice: parseFloat(variant.price_special || product.price_special_vat_included),
          color,
          size,
          ean: variant.barcode || '',
          currentStockCount: Number(variant.stock || 0),
          status: variant.active === '1' ? 'active' : 'inactive',
        });
      }
    }
  }

  return formatted;
};
