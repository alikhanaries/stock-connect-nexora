export const parseSentosPrice = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let normalized = String(value).trim();
  if (!normalized) return 0;

  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
