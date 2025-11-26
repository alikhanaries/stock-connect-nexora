export const uploadProducts = (products) => {
  return products.map((p) => ({
    parentProductSKU: p.parentProductSkuCode || null,
    productSKU: p.productSkuCode,
    name: p.name,
    description: p.description,
    brand: p.brand,
    size: p.size,
    color: p.color,
    ean: p.Ean,
    price: p.price,
    minPrice: p.MinPrice,
    maxPrice: p.MaxPrice,
    msrp: p.MSRP,
    purchasePrice: p.PurchasePrice,
    images: p.images || [],
    status: p.status,
    categories: p.categoryTrail,
    inventoryCount: p.currentStockCount ?? 0,
  }));
};
