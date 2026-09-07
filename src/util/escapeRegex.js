export const MAX_REGEX_INPUT_LENGTH = 100;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

export const sanitizeRegexInput = (value) => {
  if (value == null) return null;
  const s = String(value).slice(0, MAX_REGEX_INPUT_LENGTH);
  if (CONTROL_CHAR_RE.test(s)) return null;
  return s;
};

export const escapeRegex = (value) => {
  const sanitized = sanitizeRegexInput(value);
  if (sanitized === null) return null;
  return sanitized.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&');
};
