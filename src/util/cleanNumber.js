/**
 * Cleans a number-like value by removing commas and converting it to a float.
 *
 * Usage:
 *   cleanNumber("1,234.56")  → 1234.56
 *   cleanNumber("10,000")    → 10000
 *   cleanNumber(null)        → null
 *
 * This is used during import operations to normalize numeric values
 * coming from CSV/Excel/Google Sheets/ERP, where prices may include commas.
 */
export const cleanNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;

  return parseFloat(
    String(value)
      .replace(/,/g, '') // remove commas
      .trim()
  );
};
