import { config } from '../config/config.js';

const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const resolveLogLevel = () => LOG_LEVELS[String(config.LOG_LEVEL || 'info').toLowerCase()] ?? LOG_LEVELS.info;

const shouldIncludeStack = () => resolveLogLevel() <= LOG_LEVELS.debug;

const REDACTION_PATTERNS = [
  /((?:password|newPassword|token|accessToken|refreshToken|secret|authorization|apiKey)\s*[=:]\s*)([^\s,;'"]+)/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql):\/\/[^\s'"]+/gi,
];

const redactText = (value) => {
  if (value == null || value === '') {
    return value;
  }

  let text = String(value);

  for (const pattern of REDACTION_PATTERNS) {
    if (pattern.source.startsWith('((?:password')) {
      text = text.replace(pattern, '$1[REDACTED]');
    } else if (pattern.source.startsWith('Bearer')) {
      text = text.replace(pattern, 'Bearer [REDACTED]');
    } else {
      text = text.replace(pattern, '[REDACTED_DATABASE_URL]');
    }
  }

  if (config.DB_URL && text.includes(config.DB_URL)) {
    text = text.split(config.DB_URL).join('[REDACTED_DB_URL]');
  }

  return text;
};

const normalizeError = (error) => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
};

export const errorLog = async (error, context = {}) => {
  const normalizedError = normalizeError(error);
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    name: normalizedError.name || 'Error',
    message: redactText(normalizedError.message),
  };

  if (context.requestId) {
    entry.requestId = context.requestId;
  }

  if (context.method) {
    entry.method = context.method;
  }

  if (context.path) {
    entry.path = context.path;
  }

  if (shouldIncludeStack() && normalizedError.stack) {
    entry.stack = redactText(normalizedError.stack);
  }

  console.error(JSON.stringify(entry));
};
