// mapRowToProduct.js
export const mapRowToProduct = async (row, index, locale) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys (lowercase + trim)
  const r = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value ? String(value).trim() : ''])
  );

  // CHECK MANDATORY FIELD
  const price = parseFloat(r.price);
  if (!r.productskucode || isNaN(price) || !r.categorytrail) {
    let errorData = [];
    if (!r.productskucode) {
      errorData.push(locale.PRODUCT_SKUCODE_MISSING);
    }
    if (isNaN(price)) {
      errorData.push(locale.PRODUCT_PRICE_MISSING);
    }
    if (!r.categorytrail) {
      errorData.push(locale.PRODUCT_CATEGORYTRAIL_MISSING);
    }
    return {
      rowNumber: index,
      errorData,
    };
  }

  return {
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode,
    name: r.name || 'Unnamed Product',
    description: r.description || null,
    brand: r.brand || null,
    ean: r.ean || null, // should be unique
    price,
    minPrice: r.minprice ? parseFloat(r.minprice) : null,
    maxPrice: r.maxprice ? parseFloat(r.maxprice) : null,
    msrp: r.msrp ? parseFloat(r.msrp) : null,
    purchasePrice: r.purchaseprice ? parseFloat(r.purchaseprice) : null,
    vatRateType: r.vatratetype ? r.vatratetype.toUpperCase() : 'STANDARD',
    shippingCost: r.shippingcost ? parseFloat(r.shippingcost) : 0,
    shippingTime: r.shippingtime || null,
    url: r.url || null,
    isFrozen: r.isfrozen?.toLowerCase() === 'yes',
    categoryTrail: r.categorytrail || '',
    attributes: r.attributes,
    categories: [],
    marketPlace: r.marketplace,
    images: r.images ? r.images.split(',').map((img) => img.trim()) : [],
    currentStockCount: r.stock ? parseInt(r.stock, 10) || 0 : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};
