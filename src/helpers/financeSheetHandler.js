import csv from 'csv-parser';
import { FINANCE_HEADER_MAP, FINANCE_DATE_FIELDS } from '#constants/finance.js';

export const parseValue = (field, raw) => {
  const val = typeof raw === 'string' ? raw.trim() : raw;
  if (!val || val === '' || val === '#REF!' || val === '#N/A') return null;

  if (FINANCE_DATE_FIELDS.has(field)) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return val;
};

export const mapRowToRecord = (row, sellerId) => {
  const doc = { sellerId };
  for (const [csvHeader, modelField] of Object.entries(FINANCE_HEADER_MAP)) {
    const rawVal = row[csvHeader];
    doc[modelField] = parseValue(modelField, rawVal);
  }
  return doc;
};

export const parseSheetStream = (stream) =>
  new Promise((resolve, reject) => {
    const records = [];
    stream
      .pipe(csv())
      .on('data', (row) => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
