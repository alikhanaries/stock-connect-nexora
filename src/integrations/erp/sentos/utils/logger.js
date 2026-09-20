const PREFIX = '[Sentos]';

const serialize = (meta) => {
  if (!meta || typeof meta !== 'object') return '';
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return '';
  }
};

export const logSentosInfo = (message, meta) => {
  console.log(`${PREFIX} ${message}${serialize(meta)}`);
};

export const logSentosWarn = (message, meta) => {
  console.warn(`${PREFIX} ${message}${serialize(meta)}`);
};

export const logSentosError = (message, meta) => {
  console.error(`${PREFIX} ${message}${serialize(meta)}`);
};

export const formatSentosFetchError = (response, path) => ({
  path,
  status: response.status,
  statusText: response.statusText,
  rateLimit: {
    limit: response.headers.get('x-ratelimit-limit'),
    remaining: response.headers.get('x-ratelimit-remaining'),
    reset: response.headers.get('x-ratelimit-reset'),
    retryAfter: response.headers.get('retry-after'),
  },
});
