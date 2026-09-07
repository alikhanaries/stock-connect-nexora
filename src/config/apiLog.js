const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1';
};

const parseNumber = (value, defaultValue) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const parseCsv = (value, defaultList) => {
  if (!value || typeof value !== 'string') {
    return [...defaultList];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const DEFAULT_REDACTED_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'secret',
  'apiKey',
  'authorization',
  'creditCard',
  'cvv',
  'ssn',
];

const DEFAULT_REDACTED_HEADERS = ['authorization', 'cookie', 'x-api-key', 'apikey'];

const DEFAULT_NO_BODY_LOG_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/reset-password',
  '/api/auth/forget-password',
  '/api/auth/validate-reset-token',
  '/api/auth/refresh-token',
  '/api/user/update-password',
];

const SECONDS_PER_DAY = 24 * 60 * 60;

const retentionDays = parseNumber(process.env.API_LOG_RETENTION_DAYS, 90);

export const apiLogConfig = {
  enabled: parseBoolean(process.env.API_LOG_ENABLED, process.env.NODE_ENV === 'production'),
  logRequestBody: parseBoolean(process.env.API_LOG_LOG_REQUEST_BODY, true),
  logResponseBody: parseBoolean(process.env.API_LOG_LOG_RESPONSE_BODY, false),
  maxBodyBytes: parseNumber(process.env.API_LOG_MAX_BODY_BYTES, 16384),
  slowRequestThresholdMs: parseNumber(process.env.API_LOG_SLOW_THRESHOLD_MS, 5000),
  retentionDays,
  retentionSeconds: retentionDays > 0 ? retentionDays * SECONDS_PER_DAY : 0,
  redactedFields: parseCsv(process.env.API_LOG_REDACTED_FIELDS, DEFAULT_REDACTED_FIELDS),
  redactedHeaders: parseCsv(process.env.API_LOG_REDACTED_HEADERS, DEFAULT_REDACTED_HEADERS),
  noBodyLogPaths: parseCsv(process.env.API_LOG_NO_BODY_LOG_PATHS, DEFAULT_NO_BODY_LOG_PATHS),
  redactedPlaceholder: process.env.API_LOG_REDACTED_PLACEHOLDER || '[REDACTED]',
  truncatedPlaceholder: process.env.API_LOG_TRUNCATED_PLACEHOLDER || '[TRUNCATED]',
};

export const isNoBodyLogPath = (path) => {
  if (!path || typeof path !== 'string') {
    return false;
  }

  return apiLogConfig.noBodyLogPaths.some(
    (configuredPath) => path === configuredPath || path.startsWith(`${configuredPath}/`)
  );
};
