export const normalizeUniwareDate = (dateStr) => {
  if (!dateStr) return null;

  // fix "2025-01-29T05:59:05 00:00" → "2025-01-29T05:59:05+00:00"
  const normalized = dateStr.replace(/(\d{2}:\d{2}:\d{2})\s(\d{2}:\d{2})$/, '$1+$2');

  const d = new Date(normalized);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date format: "${dateStr}"`);
  }

  return d;
};
