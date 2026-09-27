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
export const buildSkuHierarchy = (productCode = '', color = '') => {
  const code = String(productCode || '');
  const colorText = String(color || '');
  let base = code;
  let matched = false;

  if (colorText && code.toLowerCase().endsWith(colorText.toLowerCase())) {
    base = code.slice(0, code.length - colorText.length).replace(/[.\-_]+$/, '');
    matched = true;
  }

  const grandParentSku = convertCodeFormat(base || code);
  const parentRaw = matched ? code : `${code}${colorText.replace(/\s+/g, '')}`;
  const parentSku = convertCodeFormat(parentRaw);

  return { grandParentSku, parentSku };
};

export const buildChildSku = (parentSku, sizeToken = '') => {
  const cleanSize = String(sizeToken || '').replace(/\s+/g, '');
  if (!cleanSize) return parentSku;
  return convertCodeFormat(`${parentSku}_${cleanSize}`);
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
