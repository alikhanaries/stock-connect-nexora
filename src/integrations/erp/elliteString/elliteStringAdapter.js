import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { elliteStringConfig } from './config/config.js';
import { formatElliteStringProducts } from './helper/formatter.js';
import { fetchGoogleSheet } from './utils/fetch.js';

const { ELLITE_STRING_GOOGLE_SHEET_URL } = elliteStringConfig;

export const createElliteStringAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const rows = await fetchGoogleSheet(ELLITE_STRING_GOOGLE_SHEET_URL);

      if (!rows || rows.length === 0) {
        throw new Error('Google Sheet returned empty data for ElliteString');
      }
      return formatElliteStringProducts(rows);
    },
  };
};
