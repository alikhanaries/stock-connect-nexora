export const uploadProducts = (products) => {
  return products.map((p) => ({
    parentProductSKU: p.parentMerchantProductNo || null,
    productSKU: p.merchantProductNo,
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
