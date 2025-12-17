import { createBaseERPAdapter } from '../base/BaseERPAdapter.js';
import { eliteStringLaIntimoConfig } from './config/config.js';
import { formatEliteStringLaIntimoProducts } from './helper/formatter.js';
import { fetchGoogleSheet } from './utils/fetch.js';

const { ELITE_STRING_LA_INTIMO_GOOGLE_SHEET_URL } = eliteStringLaIntimoConfig;

export const createEliteStringLaIntimoAdapter = () => {
  const base = createBaseERPAdapter();

  return {
    ...base,
    fetchProducts: async () => {
      const rows = await fetchGoogleSheet(ELITE_STRING_LA_INTIMO_GOOGLE_SHEET_URL);

      if (!rows || rows.length === 0) {
        throw new Error('Google Sheet returned empty data for Elite String La Intimo');
      }
      return formatEliteStringLaIntimoProducts(rows);
    },
  };
};
