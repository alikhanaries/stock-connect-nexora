export const mapRowToPrice = (row, rowNumber, locale) => {
  if (!row || typeof row !== 'object') {
    return {
      rowNumber,
      errorData: [locale.INVALID_ROW_DATA || 'Invalid row data'],
    };
  }

  // Normalize keys safely (lowercase + trim)
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase().trim()] = value === undefined || value === null ? '' : String(value).trim();
  }

  const errors = [];

  const parseAmount = (value) => {
    if (value === undefined || value === null || value === '') return null;
    return Number(String(value).replace(/,/g, ''));
  };

  // ---------- Mandatory fields ----------

  // SKU (mandatory)
  if (!normalized.productskucode) {
    errors.push(locale.PRODUCT_SKUCODE_MISSING || 'Product SKU missing');
  }

  // Price (mandatory)
  if (normalized.price === '' || normalized.namshiprice === '' || normalized.noonprice === '') {
    errors.push(`${locale.PRICE_MISSING} ${normalized.productskucode}`);
  }

  const price = parseAmount(normalized.price);
  if (normalized.price !== '' && (Number.isNaN(price) || price < 0)) {
    errors.push(`${locale.INVALID_PRICE} ${normalized.productskucode}`);
  }

  const namshiPrice = parseAmount(normalized.namshiprice);
  if (normalized.namshiprice !== '' && (Number.isNaN(namshiPrice) || namshiPrice < 0)) {
    errors.push(`${locale.INVALID_PRICE} ${normalized.productskucode}`);
  }

  const noonPrice = parseAmount(normalized.noonprice);
  if (normalized.noonprice !== '' && (Number.isNaN(noonPrice) || noonPrice < 0)) {
    errors.push(`${locale.INVALID_PRICE} ${normalized.productskucode}`);
  }

  if (errors.length) {
    return { rowNumber, errorData: errors };
  }

  // ---------- Optional numeric fields ----------
  // Validate ONLY if the column exists and has a value

  const parseOptionalNumber = (value, fieldName) => {
    if (value === '' || value === undefined) return undefined;

    const num = parseAmount(value);
    if (Number.isNaN(num) || num < 0) {
      errors.push(
        locale.INVALID_PRICE
          ? `${locale.INVALID_PRICE} ${normalized.productskucode} (${fieldName})`
          : `Invalid price (${fieldName}) for ${normalized.productskucode}`
      );
      return undefined;
    }
    return num;
  };

  const minPrice = 'minprice' in normalized ? parseOptionalNumber(normalized.minprice, 'minPrice') : undefined;

  const maxPrice = 'maxprice' in normalized ? parseOptionalNumber(normalized.maxprice, 'maxPrice') : undefined;

  const msrp = 'msrp' in normalized ? parseOptionalNumber(normalized.msrp, 'msrp') : undefined;

  const purchasePrice =
    'purchaseprice' in normalized ? parseOptionalNumber(normalized.purchaseprice, 'purchasePrice') : undefined;

  if (errors.length) {
    return { rowNumber, errorData: errors };
  }

  // ---------- Final payload ----------
  const priceData = {
    rowNumber,
    productSkuCode: normalized.productskucode,
    price,
    namshiPrice,
    noonPrice,
  };

  if (minPrice !== undefined) priceData.minPrice = minPrice;
  if (maxPrice !== undefined) priceData.maxPrice = maxPrice;
  if (msrp !== undefined) priceData.msrp = msrp;
  if (purchasePrice !== undefined) priceData.purchasePrice = purchasePrice;

  return priceData;
};
