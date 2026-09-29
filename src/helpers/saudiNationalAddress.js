/** Saudi National Address short code: 4 letters + 4 digits (e.g. MDQA4187). */
export const SAUDI_NATIONAL_ADDRESS_SHORT_CODE_PATTERN = /^[A-Za-z]{4}[0-9]{4}$/;

const PLACEHOLDER_VALUES = new Set(['', 'NA', 'N/A', 'null', 'undefined']);

const isPlaceholder = (value) => PLACEHOLDER_VALUES.has(String(value ?? '').trim());

export const normalizeSaudiNationalAddressShortCode = (value) => {
  if (value == null || isPlaceholder(value)) return null;
  const normalized = String(value).trim().toUpperCase();
  return SAUDI_NATIONAL_ADDRESS_SHORT_CODE_PATTERN.test(normalized) ? normalized : null;
};

const extractFromText = (text) => {
  if (isPlaceholder(text)) return null;
  const trimmed = String(text).trim();

  const whole = normalizeSaudiNationalAddressShortCode(trimmed);
  if (whole) return whole;

  const commaPrefix = trimmed.match(/^([A-Za-z]{4}[0-9]{4})\s*,/);
  if (commaPrefix) return normalizeSaudiNationalAddressShortCode(commaPrefix[1]);

  const embedded = trimmed.match(/\b([A-Za-z]{4}[0-9]{4})\b/);
  return embedded ? normalizeSaudiNationalAddressShortCode(embedded[1]) : null;
};

/**
 * Preserve upstream Saudi SPL from ChannelEngine ShippingAddress when the code is supplied
 * as a literal on documented CE fields (Merchant API has no dedicated short-code property).
 * Production Amazon.sa orders may place the code on ZipCode; Original may hold the literal code.
 */
export const resolveNationalAddressShortCodeFromChannelEngineShipping = (shippingAddress = {}) => {
  const country = String(shippingAddress.CountryIso ?? shippingAddress.countryIso ?? '').toUpperCase();
  if (country && country !== 'SA') return undefined;

  for (const value of [shippingAddress.ZipCode, shippingAddress.Original]) {
    const normalized = normalizeSaudiNationalAddressShortCode(value);
    if (normalized) return normalized;
  }

  return undefined;
};

/**
 * Resolve customer SPL short code from normalized shipping address fields.
 * Priority: nationalAddressShortCode, zipCode, then line1/streetName/line2/line3.
 */
export const extractSaudiNationalAddressShortCode = (address = {}) => {
  const { nationalAddressShortCode, zipCode, line1, line2, line3, streetName } = address;

  const fromDedicated = normalizeSaudiNationalAddressShortCode(nationalAddressShortCode);
  if (fromDedicated) return fromDedicated;

  const fromZip = normalizeSaudiNationalAddressShortCode(zipCode);
  if (fromZip) return fromZip;

  for (const field of [line1, streetName, line2, line3]) {
    const code = extractFromText(field);
    if (code) return code;
  }

  return null;
};

/**
 * Aymakan delivery_postcode: use numeric zip when valid; never pass SPL short codes through safeNumber.
 */
export const resolveDeliveryPostcode = (postcode, fallback = 11543) => {
  if (normalizeSaudiNationalAddressShortCode(postcode)) {
    return fallback;
  }

  const num = Number(postcode);
  return Number.isFinite(num) ? num : fallback;
};
