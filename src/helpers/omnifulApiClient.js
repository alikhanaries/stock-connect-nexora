import crypto from 'crypto';
import { getOmnifulAccessToken, getOmnifulBaseUrl, getOmnifulEnvironment } from './omnifulAuth.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @typedef {Object} OmnifulApiErrorDetails
 * @property {number} status
 * @property {string} message
 * @property {unknown} [body]
 * @property {string} requestId
 * @property {string} method
 * @property {string} url
 */

/** @typedef {Error & OmnifulApiErrorDetails} OmnifulApiError */

/**
 * @param {OmnifulApiErrorDetails} details
 * @returns {OmnifulApiError}
 */
export const createOmnifulApiError = ({ status, message, body, requestId, method, url }) => {
  const error = new Error(message);
  error.name = 'OmnifulApiError';
  error.status = status;
  error.body = body;
  error.requestId = requestId;
  error.method = method;
  error.url = url;
  return error;
};

/** @param {unknown} error */
export const isOmnifulApiError = (error) =>
  error instanceof Error && error.name === 'OmnifulApiError' && typeof error.status === 'number';

const sanitizeHeaders = (headers) => {
  const copy = { ...headers };
  if (copy.Authorization) {
    copy.Authorization = 'Bearer [REDACTED]';
  }
  return copy;
};

/**
 * @param {Object} entry
 */
const logOmnifulApiCall = (entry) => {
  console.log('[OmniFul API]', JSON.stringify(entry, null, 2));
};

/**
 * Documented path for Seller Custom Integration — retrieve one order by OmniFul internal ID.
 * @see https://docs.omniful.tech — Get Seller Order By OrderID
 */
export const OMNIFUL_GET_ORDER_PATH = '/sales-channel/public/v1/seller/orders';

/**
 * Execute an authenticated OmniFul Sales Channel API request with logging and error handling.
 *
 * @param {Object} options
 * @param {'GET'|'POST'|'PUT'|'PATCH'} options.method
 * @param {string} options.path - Path after base URL, e.g. `/sales-channel/public/v1/seller/orders/{id}`
 * @param {unknown} [options.body]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.orderId] - For log correlation
 * @param {boolean} [options.retryOn401=true]
 * @returns {Promise<{ data: unknown, status: number, requestId: string }>}
 */
export const omnifulApiRequest = async ({
  method,
  path,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  orderId = null,
  retryOn401 = true,
}) => {
  const requestId = crypto.randomUUID();
  const baseUrl = getOmnifulBaseUrl();
  if (!baseUrl) {
    throw new Error('OMNIFUL_API_URL is not configured');
  }

  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const startedAt = Date.now();

  const execute = async (accessToken, isRetry) => {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    logOmnifulApiCall({
      phase: 'request',
      requestId,
      orderId,
      environment: getOmnifulEnvironment(),
      method,
      url,
      headers: sanitizeHeaders(headers),
      body: body ?? null,
      isRetry,
    });

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      logOmnifulApiCall({
        phase: 'network_error',
        requestId,
        orderId,
        method,
        url,
        elapsedMs,
        error: err.message,
      });
      throw createOmnifulApiError({
        status: 0,
        message: `OmniFul network error: ${err.message}`,
        requestId,
        method,
        url,
      });
    }

    const responseText = await response.text();
    let parsedBody = null;
    try {
      parsedBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsedBody = responseText;
    }

    const elapsedMs = Date.now() - startedAt;
    logOmnifulApiCall({
      phase: 'response',
      requestId,
      orderId,
      method,
      url,
      status: response.status,
      elapsedMs,
      body: parsedBody,
      omnifulMessage: parsedBody?.message ?? parsedBody?.error ?? null,
    });

    return { response, parsedBody, elapsedMs };
  };

  let accessToken = await getOmnifulAccessToken();
  let { response, parsedBody } = await execute(accessToken, false);

  if (response.status === 401 && retryOn401) {
    accessToken = await getOmnifulAccessToken({ forceRefresh: true });
    ({ response, parsedBody } = await execute(accessToken, true));
  }

  if (response.ok) {
    return { data: parsedBody, status: response.status, requestId };
  }

  const errorMessage = buildOmnifulErrorMessage(response.status, parsedBody);
  throw createOmnifulApiError({
    status: response.status,
    message: errorMessage,
    body: parsedBody,
    requestId,
    method,
    url,
  });
};

/**
 * @param {number} status
 * @param {unknown} body
 */
const buildOmnifulErrorMessage = (status, body) => {
  const apiMessage =
    typeof body === 'object' && body !== null
      ? body.message || body.error || body.detail
      : typeof body === 'string'
        ? body
        : null;

  const hints = {
    401: 'Unauthorized — expired/wrong token, wrong environment, or missing Bearer header. Token refresh was attempted once.',
    403: 'Forbidden — integration may lack permission for this endpoint, or token belongs to a different seller/tenant.',
    404: 'Not found — verify you are using omnifulId (OmniFul internal ID from POST response data.id), not the external order_id.',
    429: 'Rate limited — OmniFul default is 60 requests/minute for Sales Channel APIs. Retry after a delay.',
    500: 'OmniFul server error — retry later or contact OmniFul support with the requestId from logs.',
  };

  const hint = hints[status] || `OmniFul API error (${status})`;
  return apiMessage ? `${hint} — ${apiMessage}` : hint;
};

/**
 * Explain 401/403 causes for operators.
 * @param {OmnifulApiError} error
 */
export const explainOmnifulAuthError = (error) => {
  if (!isOmnifulApiError(error)) return null;

  if (error.status === 401) {
    return {
      code: 401,
      causes: [
        'Access token expired (refresh attempted automatically once)',
        'OMNIFUL_REFRESH_TOKEN or DB token doc is invalid or revoked',
        'OMNIFUL_API_URL points to a different environment than where the order was created',
        'Authorization header missing or malformed',
      ],
      actions: [
        'Verify OMNIFUL_API_URL matches staging vs production',
        'Re-issue credentials from OmniFul dashboard: Settings → Apps & Integrations → Custom Apps',
        'Update tokens collection (name: omniful) or OMNIFUL_REFRESH_TOKEN in .env',
      ],
    };
  }

  if (error.status === 403) {
    return {
      code: 403,
      causes: [
        'Custom Sales Channel integration lacks GET order permission',
        'Token is for a different seller than the order owner',
        'Using Tenant API endpoint with Seller token (or vice versa)',
      ],
      actions: [
        'Confirm integration type is Seller Custom Integration (same as POST /orders)',
        'Ask OmniFul to enable read access for Seller Orders API on your integration',
        'Use GET /sales-channel/public/v1/seller/orders/{omniful_order_id} only',
      ],
    };
  }

  return null;
};
