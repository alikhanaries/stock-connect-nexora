import { COUNTRY_NAME_TO_ISO, VALID_ALPHA2_CODES } from './countryIsoData.js';

/** Trim, lowercase, strip diacritics, and normalize punctuation for name lookup. */
export const normalizeCountryKey = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’.]/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Resolve a free-form country value to ISO 3166-1 alpha-2 for Aymakan payloads.
 * @param {unknown} raw
 * @returns {string} Uppercase ISO-2 code, or empty string when input is blank.
 * @throws {Error} When the value is non-empty but cannot be resolved.
 */
export const resolveCountryIsoCode = (raw) => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const alpha2Candidate = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(alpha2Candidate)) {
    if (VALID_ALPHA2_CODES.has(alpha2Candidate)) {
      return alpha2Candidate;
    }
  }

  const code = COUNTRY_NAME_TO_ISO[normalizeCountryKey(trimmed)];
  if (code) {
    return code;
  }

  throw new Error(`Invalid country: "${trimmed}". Expected ISO 3166-1 alpha-2 code or recognized country name.`);
};
