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
 * Resolve customer SPL short code from CE/Amazon shipping address fields.
 * Priority: zipCode (when it matches the pattern), then line1/streetName prefix, then other lines.
 */
export const extractSaudiNationalAddressShortCode = (address = {}) => {
  const { zipCode, line1, line2, line3, streetName } = address;

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
