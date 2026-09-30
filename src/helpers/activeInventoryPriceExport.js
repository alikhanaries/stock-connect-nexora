export const ACTIVE_INVENTORY_PRICE_EXPORT_HEADERS = ['Brand Name', 'SKU / Product Reference', 'Inventory', 'Price'];

export const ACTIVE_INVENTORY_PRICE_EXPORT_QUERY = {
  status: 'active',
  productType: 'simple',
};

export const ACTIVE_INVENTORY_PRICE_EXPORT_PROJECTION = {
  brand: 1,
  productSkuCode: 1,
  currentStockCount: 1,
  price: 1,
};

export const buildActiveInventoryPriceCsvRow = (product) => {
  return [product.brand || '', product.productSkuCode || '', product.currentStockCount ?? 0, product.price ?? ''];
};
