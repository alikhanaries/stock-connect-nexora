const formatBaseProduct = (product, sellerId, subproductImages = []) => {
  const imgItems = (
    Array.isArray(product.img_item) ? product.img_item : typeof product.img_item === 'string' ? [product.img_item] : []
  )
    .map((i) => i?.trim())
    .filter(Boolean);
  const mergedImages = [product.image_url, ...imgItems, ...subproductImages].filter(Boolean);
  const uniqueImages = [...new Set(mergedImages)];

  return {
    sellerId,
    name: product.name,
    description: product.details,
    brand: product.brand,
    categoryTrail: product.category_path,
    price: Number(product.price_list || 0),
    minPrice: Number(product.price_list || 0),
    maxPrice: Number(product.price_list_vat_included || 0),
    msrp: Number(product.price_list_vat_included || 0),
    purchasePrice: Number(product.price_list || 0),
    vatRateType: 'STANDARD',
    status: product.active === '1' ? 'active' : 'inactive',
    primaryImageUrl: uniqueImages[0] || null,
    imageUrl: uniqueImages[0] || null,
    extraImageUrl1: uniqueImages[1] || null,
    extraImageUrl2: uniqueImages[2] || null,
    extraImageUrl3: uniqueImages[3] || null,
    images: uniqueImages,
    volumetricWeightCm: 0.3,
    hsCodeAE: product.code,
    hsCodeSA: product.code,
    category: product.category_path,
    updatedAt: new Date(),
  };
};

export const formatGurmanProduct = (raw = [], sellerId) => {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const formatted = [];

  for (const product of raw) {
    const subproducts = Array.isArray(product.subproducts?.subproduct)
      ? product.subproducts.subproduct
      : product.subproducts?.subproduct
        ? [product.subproducts.subproduct]
        : [];
    const subproductImages = subproducts.flatMap((sub) => {
      const imgs = Array.isArray(sub.img_item) ? sub.img_item : typeof sub.img_item === 'string' ? [sub.img_item] : [];
      return [sub.image_url, ...imgs].filter(Boolean);
    });

    const base = formatBaseProduct(product, sellerId, subproductImages);
    const grandParentSku = product.code || `SKU-${Date.now()}`;
    const grandParent = {
      ...base,
      productSkuCode: grandParentSku,
      parentProductSkuCode: null,
      grandParentProductSkuCode: null,
      productType: 'configurable',
      currentStockCount: subproducts.reduce((s, v) => s + Number(v.stock || 0), 0),
      color: '',
      size: '',
      ean: '',
    };
    formatted.push(grandParent);

    if (subproducts.length === 0) continue;
    const groupedByColor = subproducts.reduce((acc, sub) => {
      const color = (sub.color || product.color_new || '').trim() || 'Default';
      (acc[color] ||= []).push(sub);
      return acc;
    }, {});

    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      const first = variants[0];

      const parent = {
        ...base,
        grandParentProductSkuCode: grandParentSku,
        parentProductSkuCode: null,
        productSkuCode: parentSku,
        color,
        size: '',
        ean: '',
        productType: 'configurable',
        price: Number(first.price_list || product.price_list || 0),
        currentStockCount: variants.reduce((s, v) => s + Number(v.stock || 0), 0),
      };
      formatted.push(parent);

      for (const variant of variants) {
        const size = (variant.size || '').trim() || 'NOSIZE';
        const safeSize = size.replace(/\s+/g, '_').toUpperCase();
        const childSku = `${parentSku}-${safeSize}`;

        const variantImages = [
          variant.image_url,
          ...(Array.isArray(variant.img_item)
            ? variant.img_item
            : typeof variant.img_item === 'string'
              ? [variant.img_item]
              : []),
        ].filter(Boolean);

        const mergedChildImages = [...new Set([...base.images, ...variantImages])];

        const child = {
          ...base,
          primaryImageUrl: mergedChildImages[0] || null,
          imageUrl: mergedChildImages[0] || null,
          extraImageUrl1: mergedChildImages[1] || null,
          extraImageUrl2: mergedChildImages[2] || null,
          extraImageUrl3: mergedChildImages[3] || null,
          images: mergedChildImages,
          grandParentProductSkuCode: grandParentSku,
          parentProductSkuCode: parentSku,
          productSkuCode: childSku,
          color,
          size,
          ean: variant.barcode || '',
          price: Number(variant.price_list || product.price_list || 0),
          minPrice: Number(variant.price_list || product.price_list || 0),
          maxPrice: Number(variant.price_tl_vat_included || product.price_list_vat_included || 0),
          msrp: Number(variant.price_tl_vat_included || product.price_list_vat_included || 0),
          purchasePrice: Number(variant.price_list || 0),
          currentStockCount: Number(variant.stock || 0),
          volumetricWeightCm: Number(variant.desi || product.desi || 0),
          status: variant.active === '1' ? 'active' : 'inactive',
          productType: 'simple',
        };
        formatted.push(child);
      }
    }
  }

  return formatted.filter(Boolean);
};
