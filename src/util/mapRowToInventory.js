import {
  LOW_STOCK_THRESHOLD,
  LOW_STOCK_THRESHOLD_SELLERS,
  MAX_PRICE,
  MAX_PRICE_SELLERS,
  PRODUCT_STATUSES,
} from '#constants/common.js';
const [ACTIVE, INACTIVE] = PRODUCT_STATUSES;
import Seller from '#models/Seller.js';

export const mapRowToInventory = async (row, index, locale) => {
  if (!row || typeof row !== 'object') return null;

  // Normalize keys
  const r = {};
  for (const [key, value] of Object.entries(row)) {
    r[key.toLowerCase().trim()] = value ? String(value).trim() : '';
  }

  // Required validations
  const errorData = [];
  if (!r.productskucode) errorData.push(locale.INVENTORY_SKUCODE_MISSING);
  const parsedStock = Number(r.currentstockcount);
  if (r.currentstockcount === undefined || r.currentstockcount === '') {
    errorData.push(`${locale.CURRENT_STOCK_COUNT_MISSING} for SKU: ${r.productskucode || ''}`);
  } else if (Number.isNaN(parsedStock) || parsedStock < 0) {
    errorData.push(`${locale.INVALID_STOCK_COUNT} for SKU: ${r.productskucode || ''}`);
  }

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

export const getSellerNameById = async (sellerId) => {
  const seller = await Seller.findById(sellerId, { name: 1 }).lean();

  if (!seller?.name) {
    throw new Error('Seller not found');
  }

  return seller.name.toLowerCase();
};

export const getProductStatus = (sellerName, currentStockCount, price = 0) => {
  const trimedSellerName = sellerName ? sellerName.toLowerCase().trim() : '';
  const isLowStockThresholdSeller = LOW_STOCK_THRESHOLD_SELLERS.includes(trimedSellerName);
  const isMaxPriceSeller = MAX_PRICE_SELLERS.includes(trimedSellerName);

  const isActiveByStock = isLowStockThresholdSeller ? currentStockCount >= LOW_STOCK_THRESHOLD : currentStockCount > 0;
  // KIP/RAMSEY/EXQUISE price must be below 1145
  const isActiveByPrice = isMaxPriceSeller ? price < MAX_PRICE : true;

  return isActiveByStock && isActiveByPrice ? ACTIVE : INACTIVE;
};
