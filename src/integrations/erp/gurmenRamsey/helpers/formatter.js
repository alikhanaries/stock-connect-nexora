const formatBaseProduct = (product, sellerId, subproductImages = []) => {
  const imgItems = [
    ...(Array.isArray(product.img_item) ? product.img_item : []),
    ...(Array.isArray(product.additional_image_url) ? product.additional_image_url : []),
  ]
    .map((i) => i?.trim())
    .filter(Boolean);
  const uniqueImages = [...new Set([...imgItems, ...subproductImages])];
  return {
    sellerId,
    name: product.name,
    description: product.details,
    brand: product.brand,
    categoryTrail: product.category_path,
    price: Number(product.price_special || 0),
    minPrice: Number(product.price_special || 0),
    maxPrice: Number(product.price_special_vat_included || 0),
    msrp: Number(product.price_special_vat_included || 0),
    purchasePrice: Number(product.price_special || 0),
    vatRateType: 'STANDARD',
    status: 'active',
    primaryImageUrl: uniqueImages[0] || null,
    imageUrl: uniqueImages[0] || null,
    extraImageUrl1: uniqueImages[1] || null,
    extraImageUrl2: uniqueImages[2] || null,
    extraImageUrl3: uniqueImages[3] || null,
    images: uniqueImages || null,
    category: product.category_path,
    updatedAt: new Date(),
  };
};

export const formatRamseyProduct = (raw = [], sellerId) => {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const formatted = [];
  for (const product of raw) {
    const subproducts = product.subproducts?.subproduct ? product.subproducts.subproduct.flat() : [];
    const subproductImages = [];
    const base = formatBaseProduct(product, sellerId, subproductImages);
    const grandParentSku = product.code;
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

    if (!subproducts.length) continue;
    const groupedByColor = subproducts.reduce((acc, sub) => {
      const color = sub.color_drop?.trim() || 'Default';
      (acc[color] ||= []).push(sub);
      return acc;
    }, {});
    for (const [color, variants] of Object.entries(groupedByColor)) {
      const safeColor = color.replace(/\s+/g, '_').toUpperCase();
      const parentSku = `${grandParentSku}-${safeColor}`;
      const parent = {
        ...base,
        grandParentProductSkuCode: grandParentSku,
        parentProductSkuCode: null,
        productSkuCode: parentSku,
        productType: 'configurable',
        color,
        currentStockCount: variants.reduce((s, v) => s + Number(v.stock || 0), 0),
        minPrice: Math.min(...variants.map((v) => Number(v.price_tl_vat_included_discount))),
        maxPrice: Math.max(...variants.map((v) => Number(v.price_tl_vat_included_discount))),
        price: Number(product.price_special),
      };
      formatted.push(parent);
      for (const variant of variants) {
        const size = variant.size || 'NOSIZE';
        const safeSize = size.replace(/\s+/g, '_').toUpperCase();
        const childSku = `${parentSku}-${safeSize}`;
        const price = Number(variant.price_tl_vat_included_discount);
        const child = {
          ...base,
          primaryImageUrl: base.images[0],
          images: base.images,
          grandParentProductSkuCode: grandParentSku,
          parentProductSkuCode: parentSku,
          productSkuCode: childSku,
          productType: 'simple',
          color,
          size,
          ean: variant.barcode || '',
          price,
          minPrice: price,
          maxPrice: price,
          purchasePrice: price,
          currentStockCount: Number(variant.stock || 0),
          status: variant.active === '1' ? 'active' : 'inactive',
        };
        formatted.push(child);
      }
    }
  }
  return formatted;
};
