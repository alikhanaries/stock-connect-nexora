import { apiLogConfig } from '../config/apiLog.js';

const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'token',
  'secret',
  'authorization',
  'credential',
  'cvv',
  'ssn',
  'apikey',
  'clientsecret',
];

const normalizeKey = (key) => String(key).toLowerCase().replace(/[_-]/g, '');

const matchesSensitiveSubstring = (key) => {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_SUBSTRINGS.some((fragment) => normalized.includes(fragment));
};

const shouldRedactField = (key, redactedFields) =>
  matchesSensitiveSubstring(key) ||
  redactedFields.some((field) => normalizeKey(field) === normalizeKey(key));

const shouldRedactHeader = (key, redactedHeaders) =>
  redactedHeaders.some((header) => normalizeKey(header) === normalizeKey(key));

export const redactObject = (value, options = {}) => {
  const redactedFields = options.redactedFields ?? apiLogConfig.redactedFields;
  const placeholder = options.placeholder ?? apiLogConfig.redactedPlaceholder;

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, options));
  }

  if (typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  return Object.entries(value).reduce((result, [key, nestedValue]) => {
    if (shouldRedactField(key, redactedFields)) {
      result[key] = placeholder;
      return result;
    }

    if (nestedValue && typeof nestedValue === 'object' && !(nestedValue instanceof Date)) {
      result[key] = redactObject(nestedValue, options);
      return result;
    }

    result[key] = nestedValue;
    return result;
  }, {});
};

export const redactHeaders = (headers = {}, options = {}) => {
  const redactedHeaders = options.redactedHeaders ?? apiLogConfig.redactedHeaders;
  const placeholder = options.placeholder ?? apiLogConfig.redactedPlaceholder;

  return Object.entries(headers).reduce((result, [key, value]) => {
    result[key] = shouldRedactHeader(key, redactedHeaders) ? placeholder : value;
    return result;
  }, {});
};

export const truncatePayload = (value, options = {}) => {
  const maxBytes = options.maxBytes ?? apiLogConfig.maxBodyBytes;
  const marker = options.truncatedPlaceholder ?? apiLogConfig.truncatedPlaceholder;

  if (value === null || value === undefined) {
    return value;
  }

  let serialized;

  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    const fallback = String(value);
    const preview = Buffer.byteLength(fallback, 'utf8') <= maxBytes ? fallback : fallback.slice(0, maxBytes);

    return {
      truncated: true,
      marker,
      preview,
    };
  }

  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
    return value;
  }

  return {
    truncated: true,
    marker,
    preview: serialized.slice(0, maxBytes),
    originalBytes: Buffer.byteLength(serialized, 'utf8'),
  };
};

export const sanitizePayload = (value, options = {}) => {
  const redactedValue = redactObject(value, options);
  return truncatePayload(redactedValue, options);
};
