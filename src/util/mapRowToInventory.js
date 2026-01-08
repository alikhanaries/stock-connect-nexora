export const mapRowToInventory = async (row, index, locale) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys
  const r = {};
  for (const [key, value] of Object.entries(row)) {
    r[key.toLowerCase().trim()] = value ? String(value).trim() : '';
  }

  // Required validations
  const errorData = [];
  if (!r.productskucode) errorData.push(locale.PRODUCT_SKUCODE_MISSING);
  if (r.currentstockcount === undefined || r.currentstockcount === '') {
    errorData.push(locale.CURRENT_STOCK_COUNT_MISSING);
  }
  const parsedStock = Number(r.currentstockcount);
  if (errorData.length) return { rowNumber: index, errorData };

  // Build inventory object
  const inventory = {
    rowNumber: index,
    productSkuCode: r.productskucode,
    currentStockCount: parsedStock,
  };

  // Remove empty / null values except 0
  for (const key in inventory) {
    const v = inventory[key];
    if (v === undefined || v === '') delete inventory[key];
  }

  return inventory;
};
