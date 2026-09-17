import express from 'express';
import { parseXMLFeed } from '#root/src/integrations/common/helpers/xmlParser.js';
import { failResponse } from '../helpers/response.js';

const PARTNER_JSON_LIMIT = '64kb';
const PARTNER_JSON_MAX_BYTES = 64 * 1024;

const USERNAME_KEYS = ['username', 'user', 'userName'];
const PASSWORD_KEYS = ['password', 'pass', 'Password'];

export const isAllowedPartnerContentType = (req) => {
  const raw = req.headers['content-type'];
  if (!raw) {
    return false;
  }
  const type = raw.split(';')[0].trim().toLowerCase();
  if (type === 'application/json' || type.endsWith('+json')) {
    return true;
  }
  if (type === 'text/plain') {
    return true;
  }
  return false;
};

export const enforcePartnerBodySizeLimit = (req, res, next) => {
  const length = Number(req.headers['content-length'] || 0);
  if (length > PARTNER_JSON_MAX_BYTES) {
    return failResponse(res, 413, { message: 'Payload too large' });
  }
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const size = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
    if (size > PARTNER_JSON_MAX_BYTES) {
      return failResponse(res, 413, { message: 'Payload too large' });
    }
  }
  return next();
};

export const requirePartnerJsonContentType = (req, res, next) => {
  const length = Number(req.headers['content-length'] || 0);
  if (length === 0) {
    return next();
  }
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return next();
  }
  if (isAllowedPartnerContentType(req)) {
    return next();
  }
  return failResponse(res, 415, { message: 'Unsupported Content-Type' });
};

const createParsePartnerJsonBody = (isContentTypeAllowed) =>
  express.json({
    limit: PARTNER_JSON_LIMIT,
    type: (req) => {
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        return false;
      }
      return isContentTypeAllowed(req);
    },
  });

export const parsePartnerJsonBody = createParsePartnerJsonBody(isAllowedPartnerContentType);

const isAuthTokenRequest = (req) => {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return path.endsWith('/authToken');
};

const isXmlContentType = (req) => {
  const raw = req.headers['content-type'];
  if (!raw) {
    return false;
  }
  const type = raw.split(';')[0].trim().toLowerCase();
  return type === 'text/xml' || type === 'application/xml' || type.endsWith('+xml');
};

const createRequirePartnerJsonContentType = (isContentTypeAllowed) => (req, res, next) => {
  const length = Number(req.headers['content-length'] || 0);
  if (length === 0) {
    return next();
  }
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return next();
  }
  if (isContentTypeAllowed(req)) {
    return next();
  }
  return failResponse(res, 415, { message: 'Unsupported Content-Type' });
};

const isMissingContentType = (req) => {
  const raw = req.headers['content-type'];
  return !raw || !String(raw).trim();
};

const findCredentialValue = (node, keys) => {
  if (node == null || typeof node === 'string') {
    return undefined;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const value = findCredentialValue(item, keys);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase())) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
      }

      const nested = findCredentialValue(value, keys);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
};

const credentialsFromObject = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const username = findCredentialValue(value, USERNAME_KEYS);
  const password = findCredentialValue(value, PASSWORD_KEYS);

  if (!username || !password) {
    return null;
  }

  return { username, password };
};

const parseAuthTokenBodyToCredentials = async (rawBody) => {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return credentialsFromObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  try {
    const parsedXml = await parseXMLFeed(trimmed);
    return credentialsFromObject(parsedXml);
  } catch {
    return null;
  }
};

const authTokenXmlTextParser = express.text({
  limit: PARTNER_JSON_LIMIT,
  type: (req) => {
    if (!isAuthTokenRequest(req) || !isXmlContentType(req)) {
      return false;
    }
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return false;
    }
    return true;
  },
});

const parseAuthTokenXmlCredentials = async (req, res, next) => {
  if (!isAuthTokenRequest(req) || !isXmlContentType(req)) {
    return next();
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return next();
  }

  if (typeof req.body !== 'string') {
    return failResponse(res, 400, { message: 'Invalid request body' });
  }

  try {
    const credentials = await parseAuthTokenBodyToCredentials(req.body);
    if (!credentials) {
      return failResponse(res, 400, { message: 'Invalid request body' });
    }

    req.body = credentials;
    return next();
  } catch {
    return failResponse(res, 400, { message: 'Invalid request body' });
  }
};

/** UniCommerce POST /authToken may send JSON credentials with no Content-Type (HEADERS=null). */
const isAllowedAuthTokenContentType = (req) => {
  if (isAllowedPartnerContentType(req)) {
    return true;
  }
  if (isMissingContentType(req)) {
    return true;
  }
  if (isXmlContentType(req)) {
    return true;
  }
  const raw = req.headers['content-type'];
  if (!raw) {
    return false;
  }
  const type = raw.split(';')[0].trim().toLowerCase();
  // UniCommerce Java HTTP client often labels a JSON body as form-urlencoded or octet-stream.
  if (type === 'application/x-www-form-urlencoded' || type === 'application/octet-stream') {
    return true;
  }
  return false;
};

export const partnerJsonBodyMiddleware = [
  enforcePartnerBodySizeLimit,
  requirePartnerJsonContentType,
  parsePartnerJsonBody,
];

export const authTokenPartnerJsonBodyMiddleware = [
  enforcePartnerBodySizeLimit,
  authTokenXmlTextParser,
  parseAuthTokenXmlCredentials,
  createRequirePartnerJsonContentType(isAllowedAuthTokenContentType),
  createParsePartnerJsonBody(isAllowedAuthTokenContentType),
];
