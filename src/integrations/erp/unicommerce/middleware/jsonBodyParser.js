import express from 'express';
import { failResponse } from '../helpers/response.js';

const PARTNER_JSON_LIMIT = '64kb';
const PARTNER_JSON_MAX_BYTES = 64 * 1024;

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

/** Temporary DEV diagnostics for UniCommerce Java Content-Type investigation. */
const isAuthTokenContentTypeDebugEnabled = () => {
  if (process.env.UNICOMMERCE_AUTH_CONTENT_TYPE_DEBUG === 'true') {
    return true;
  }
  if (process.env.UNICOMMERCE_AUTH_CONTENT_TYPE_DEBUG === 'false') {
    return false;
  }
  return process.env.NODE_ENV !== 'production';
};

const logAuthTokenContentTypeRejection = (req) => {
  if (!isAuthTokenContentTypeDebugEnabled() || !isAuthTokenRequest(req)) {
    return;
  }

  console.info('[unicommerce-authToken-content-type-415]', {
    method: req.method,
    path: (req.originalUrl || req.url || '').split('?')[0],
    contentType: req.headers['content-type'] ?? null,
    contentLength: req.headers['content-length'] ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
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
  logAuthTokenContentTypeRejection(req);
  return failResponse(res, 415, { message: 'Unsupported Content-Type' });
};

const isMissingContentType = (req) => {
  const raw = req.headers['content-type'];
  return !raw || !String(raw).trim();
};

/** UniCommerce POST /authToken may send JSON credentials with no Content-Type (HEADERS=null). */
const isAllowedAuthTokenContentType = (req) => {
  if (isAllowedPartnerContentType(req)) {
    return true;
  }
  if (isMissingContentType(req)) {
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
  createRequirePartnerJsonContentType(isAllowedAuthTokenContentType),
  createParsePartnerJsonBody(isAllowedAuthTokenContentType),
];
