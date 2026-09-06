import crypto from 'crypto';
import mongoose from 'mongoose';
import { apiLogConfig, isNoBodyLogPath } from '#config/apiLog.js';
import ApiCallLog from '#models/ApiCallLog.js';
import { redactHeaders, sanitizePayload } from '#helpers/apiLogRedaction.js';
import { errorLog } from './errorLogMiddleware.js';

const NS_PER_MS = 1_000_000n;

const sanitizeQuery = (query) => {
  if (!query || !Object.keys(query).length) {
    return undefined;
  }

  return sanitizePayload(query);
};

const resolvePath = (req) => {
  const [pathname] = req.originalUrl.split('?');
  return pathname;
};

const resolveIntegration = (path) => {
  if (!path.startsWith('/api/erp/')) {
    return 'core';
  }

  const match = path.match(/^\/api\/erp\/([^/?]+)/);
  return match?.[1] || 'erp';
};

const resolveRoute = (req) => {
  if (!req.route?.path) {
    return undefined;
  }

  return `${req.baseUrl || ''}${req.route.path}`;
};

const toObjectIds = (sellerIds) => {
  if (!Array.isArray(sellerIds)) {
    return undefined;
  }

  return sellerIds
    .filter((sellerId) => mongoose.Types.ObjectId.isValid(sellerId))
    .map((sellerId) => new mongoose.Types.ObjectId(sellerId));
};

const parseResponseBody = (body) => {
  if (typeof body !== 'string') {
    return body;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const extractErrorMessage = (statusCode, body) => {
  if (statusCode < 400 || body === undefined || body === null) {
    return undefined;
  }

  const parsedBody = parseResponseBody(body);

  if (typeof parsedBody === 'string') {
    return parsedBody.slice(0, 500);
  }

  if (typeof parsedBody === 'object') {
    return parsedBody.message || parsedBody.error || undefined;
  }

  return undefined;
};

const getDurationMs = (startTime) => Number(process.hrtime.bigint() - startTime) / Number(NS_PER_MS);

export const apiLogMiddleware = (req, res, next) => {
  if (!apiLogConfig.enabled) {
    return next();
  }

  try {
    const requestId = crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startTime = process.hrtime.bigint();
    const path = resolvePath(req);
    const skipBodyLogging = isNoBodyLogPath(path);

    const requestSnapshot = {
      requestId,
      method: req.method,
      path,
      requestQuery: sanitizeQuery(req.query),
      requestHeaders: redactHeaders(req.headers),
      requestBody:
        !skipBodyLogging && apiLogConfig.logRequestBody ? sanitizePayload(req.body) : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      integration: resolveIntegration(path),
    };

    let capturedResponseBody;
    const originalSend = res.send.bind(res);

    res.send = function send(body) {
      capturedResponseBody = body;
      return originalSend(body);
    };

    res.on('finish', () => {
      try {
        const durationMs = Math.round(getDurationMs(startTime));
        const statusCode = res.statusCode;
        const parsedResponseBody = parseResponseBody(capturedResponseBody);

        const logDocument = {
          requestId: requestSnapshot.requestId,
          method: requestSnapshot.method,
          path: requestSnapshot.path,
          route: resolveRoute(req),
          statusCode,
          durationMs,
          isSlow: durationMs >= apiLogConfig.slowRequestThresholdMs,
          userId: req.user?._id,
          userEmail: req.user?.email,
          userRole: req.user?.role,
          sellerId: req.sellerId,
          sellerIds: toObjectIds(req.sellerIds),
          sellerName: req.seller?.name,
          ip: requestSnapshot.ip,
          userAgent: requestSnapshot.userAgent,
          requestHeaders: requestSnapshot.requestHeaders,
          requestQuery: requestSnapshot.requestQuery,
          requestBody: requestSnapshot.requestBody,
          responseBody:
            !skipBodyLogging && apiLogConfig.logResponseBody && capturedResponseBody !== undefined
              ? sanitizePayload(parsedResponseBody)
              : undefined,
          errorMessage: extractErrorMessage(statusCode, capturedResponseBody),
          integration: requestSnapshot.integration,
        };

        void ApiCallLog.create(logDocument).catch((error) => {
          void errorLog(error);
        });
      } catch (error) {
        void errorLog(error);
      }
    });

    return next();
  } catch (error) {
    void errorLog(error);
    return next();
  }
};
