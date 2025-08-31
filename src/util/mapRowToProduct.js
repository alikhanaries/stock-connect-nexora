export const mapRowToProduct = (row) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys (lowercase + trim)
  const r = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value ? String(value).trim() : ''])
  );

  const safeParse = (val) => {
    try {
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  };

  return {
    parentProductSkuCode: r.parentproductskucode || null,
    productSkuCode: r.productskucode || null,
    name: r.name || `Unnamed Product`,
    description: r.description || null,
    brand: r.brand || null,
    ean: r.ean || null, // should be unique
    price: r.price ? parseFloat(r.price) : 0.01,
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
    attributes: safeParse(r.attributes),
    categories: [],
    marketPlace: r['market-place'] ? r['market-place'].split(',').map((m) => m.trim()) : [],
    images: r.images ? r.images.split(',').map((img) => img.trim()) : [],
    currentStockCount: r.stock ? parseInt(r.stock, 10) || 0 : 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};
