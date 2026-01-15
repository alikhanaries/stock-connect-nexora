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
    hsCodeAE: p.hsCodeAE,
    hsCodeSA: p.hsCodeSA,
  }));
};

export const groupByParent = (products) => {
  const map = new Map();

  for (const product of products) {
    const parentKey = product.parentProductSkuCode || product.productSkuCode;

    if (!map.has(parentKey)) {
      map.set(parentKey, []);
    }

    map.get(parentKey).push(product);
  }

  return Array.from(map.values());
};

export const buildBatchesKeepingParentsIntact = (groupedProducts, batchSize) => {
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const group of groupedProducts) {
    if (group.length > batchSize) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentSize = 0;
      }
      batches.push(group);
      continue;
    }

    if (currentSize + group.length > batchSize) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }

    currentBatch.push(...group);
    currentSize += group.length;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};
