export const extractMainImage = (pictures) => {
  if (!Array.isArray(pictures)) return null;

  const valid = pictures.filter((p) => p.picture && p.picture !== '');
  return valid.length > 0 ? valid[0].picture : null;
};

export const extractImages = (pictures) => {
  if (!Array.isArray(pictures)) return [];

  return pictures.filter((p) => p.picture && p.picture !== '').map((p) => p.picture);
};

export const extractMainVariantImage = (arr) => {
  if (!Array.isArray(arr)) return null;
  return arr.length > 0 ? arr[0].picture : null;
};

export const safeNumber = (val, min = 0) => Math.max(min, Number(val) || 0);

const cleanName = (value = '') =>
  value
    .toString()
    .trim()
    .replace(/\u00A0/g, ' ') // non-breaking space
    .toUpperCase();

// ============================================
// UNIVERSAL NORMALIZATION
// ============================================
const normalizeKey = (value = '') =>
  value
    .toString()
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/Ğ/g, 'G')
    .replace(/Ş/g, 'S')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDisplay = (value = '') => value.toString().trim().replace(/\s+/g, ' ');

const extractVariantSpec = (varationspec = []) => {
  let originalSize = '';
  let originalColor = '';
  for (const spec of varationspec) {
    const key = cleanName(spec.name);

    if (key === 'BEDEN' || key === 'Beden') {
      originalSize = spec.value;
    }

    if (key === 'RENK' || key === 'Renk') {
      originalColor = spec.value;
    }
  }

  return {
    originalSize: normalizeDisplay(originalSize),
    normalizedSize: normalizeKey(originalSize),

    originalColor: normalizeDisplay(originalColor),
    normalizedColor: normalizeKey(originalColor),
  };
};

// ============================================
// NORMALIZE VARIANTS
// ============================================
export const normalizeAndTranslateVariants = async (variations = []) => {
  if (!Array.isArray(variations)) return [];

  return variations.map((v) => {
    const { originalSize, normalizedSize, originalColor, normalizedColor } = extractVariantSpec(v.variationSpec || []);

    return {
      ...v,
      originalSize,
      normalizedSize,
      originalColor,
      normalizedColor,
    };
  });
};

export const mapImageUrls = (images = []) => ({
  primaryImageUrl: images[0] || '',
  imageUrl: images[0] || '',
  extraImageUrl1: images[1] || '',
  extraImageUrl2: images[2] || '',
  extraImageUrl3: images[3] || '',
});
export const resolveImages = (preferred = [], fallback = []) =>
  Array.isArray(preferred) && preferred.length > 0 ? preferred : fallback;
// Normalize variant specs (deterministic)

export const convertCodeFormat = (value = '') => {
  if (!value) return value;
  return value.replace(/[.\-_]+/g, '_');
};

export const formatEntegraDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};
