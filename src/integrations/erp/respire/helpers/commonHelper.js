import { mapErpStyleImageFields, EXTRA_IMAGE_URL_KEYS } from '#helpers/productImageFields.js';
import { priceConverter } from '#root/src/integrations/common/helpers/currencyConverter.js';

export const convertRespirePrice = async (currencyCode = 'TRY', rawValue = 0) => {
  const value = parseFloat(rawValue);
  if (!value || isNaN(value) || value <= 0) return 0;

  const sarPrice = await priceConverter(currencyCode, value);
  if (!sarPrice || sarPrice <= 0) return 0;

  return Number(sarPrice.toFixed(2));
};

// Respire's channel price columns: olltek (main Ollkom price, also used as namshiPrice
// like Entegra's namshi_fiyat), noon, amazon_sa, sixth_street, styli. Respire only fills
// these on the root product (variants are always 0), so pass the parent's result as
// `fallback` when converting a variant to inherit any price the variant doesn't carry.
export const convertRespireChannelPrices = async (currencyCode, src = {}, fallback = {}) => {
  const convert = async (rawValue, key) => (await convertRespirePrice(currencyCode, rawValue)) || fallback[key] || 0;

  const price = await convert(src.olltek, 'price');

  return {
    price,
    specialPrice: await convert(src.site_indirimli_fiyati, 'specialPrice'),
    purchasePrice: (await convert(src.buying_price, 'purchasePrice')) || price,
    noonPrice: await convert(src.noon, 'noonPrice'),
    namshiPrice: price,
    amazonPrice: await convert(src.amazon_sa, 'amazonPrice'),
    sixthStreetPrice: await convert(src.sixth_street, 'sixthStreetPrice'),
    styliPrice: await convert(src.styli, 'styliPrice'),
  };
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

    // Respire prefixes size spec names by category, e.g. "Pantolon Beden", "Tişört Beden"
    if (key.includes('BEDEN')) {
      originalSize = spec.value;
    }

    if (key.includes('RENK')) {
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

export const mapImageUrls = (images = []) => {
  const mapped = mapErpStyleImageFields(images);
  return {
    primaryImageUrl: mapped.primaryImageUrl || '',
    imageUrl: mapped.imageUrl || '',
    ...Object.fromEntries(EXTRA_IMAGE_URL_KEYS.map((key) => [key, mapped[key] || ''])),
  };
};
export const resolveImages = (preferred = [], fallback = []) =>
  Array.isArray(preferred) && preferred.length > 0 ? preferred : fallback;

export const convertCodeFormat = (value = '') => {
  if (!value) return value;
  return value.replace(/[.\-_]+/g, '_');
};

// Respire's productCode already bakes the color into the code for most products
// (e.g. "R-1120Siyah"), but a handful of products list every color under one bare
// code (e.g. "5625213" with 21 colors). Grouping variants by color (see formatter.js)
// already handles the data correctly either way, but the SKU itself must also differ
// per color group, or later colors would silently overwrite earlier ones in the DB.
// Strip the matched color suffix to recover the true grandparent code; when no match
// is found (the bare-code case) the color is appended instead, so the parent SKU is
// always unique per color.
// SKU format: base_Color_Size, e.g. "21073K.Mavi" + size 30 -> "21073" / "21073_KMavi" /
// "21073_KMavi_30". The base keeps Respire's own characters ("R-1131"); the color part
// drops dots/spaces/dashes ("K.Mavi" -> "KMavi").
const compactColor = (value = '') => String(value).replace(/[\s.\-_]+/g, '');

// Length of the part at the end of `code` that is the color, or 0. Tries the exact color,
// its space-less form ("Bebe Mavi" -> "BebeMavi"), then a code ending that is only the
// start ("21073BuzMavi" / "Buz Mavisi") or end ("R-5010Melanj" / "Gri Melanj") of it.
const findColorSuffixLength = (code, colorText) => {
  const lowerCode = code.toLowerCase();
  const exact = [colorText, colorText.replace(/\s+/g, '')].find((c) => c && lowerCode.endsWith(c.toLowerCase()));
  if (exact) return exact.length;

  const lowerColor = colorText.replace(/\s+/g, '').toLowerCase();
  for (let len = Math.min(code.length - 1, lowerColor.length - 1); len >= 3; len--) {
    const ending = lowerCode.slice(-len);
    if (lowerColor.startsWith(ending) || lowerColor.endsWith(ending)) return len;
  }
  return 0;
};

export const buildSkuHierarchy = (productCode = '', color = '') => {
  const code = String(productCode || '');
  const colorText = String(color || '').trim();

  const suffixLength = colorText ? findColorSuffixLength(code, colorText) : 0;
  const base = code.slice(0, code.length - suffixLength).replace(/[\s.\-_]+$/, '') || code;
  const colorPart = compactColor(suffixLength ? code.slice(code.length - suffixLength) : colorText);

  const grandParentSku = base;
  const parentSku = colorPart ? `${base}_${colorPart}` : base;

  return { grandParentSku, parentSku };
};

export const buildChildSku = (parentSku, sizeToken = '') => {
  const cleanSize = String(sizeToken || '').replace(/\s+/g, '');
  if (!cleanSize) return parentSku;
  return `${parentSku}_${cleanSize}`;
};

// RSP_195_02_001 → RSP.195.02-001
export const formatRespireProductCode = (value = '') => {
  if (!value) return value;
  const parts = value.split('_');
  if (parts.length < 2) return value;
  return parts.slice(0, -1).join('.') + '-' + parts[parts.length - 1];
};

export const formatRespireDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};
