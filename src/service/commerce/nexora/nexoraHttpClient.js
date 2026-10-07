import { config } from '#config/config.js';
import { CommerceProviderError } from '../CommerceProviderError.js';

const STOCK_CONNECT_PREFIX = '/api/v2/stock-connect';

function readConfigValue(envKey, configValue) {
  const fromEnv = process.env[envKey];
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim();
  }
  return (configValue || '').trim();
}

function resolveBearerToken(apiKey) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('nxk_')) return trimmed;
  return `nxk_${trimmed}`;
}

export function buildNexoraAuthHeaders() {
  const token = resolveBearerToken(readConfigValue('NEXORA_API_KEY', config.NEXORA_API_KEY));
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const tenantId = readConfigValue('NEXORA_TENANT_ID', config.NEXORA_TENANT_ID);
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }
  return headers;
}

export function buildNexoraUrl(path, query) {
  const base = readConfigValue('NEXORA_BASE_URL', config.NEXORA_BASE_URL).replace(/\/$/, '');
  if (!base) {
    throw new CommerceProviderError('NEXORA_BASE_URL is not configured', {
      provider: 'nexora',
      operation: 'config',
      externalCode: 'CONFIGURATION_ERROR',
    });
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(
    `${base}${normalizedPath.startsWith(STOCK_CONNECT_PREFIX) ? normalizedPath : `${STOCK_CONNECT_PREFIX}${normalizedPath}`}`
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function mapHttpError(status, body, operation) {
  const message =
    (typeof body === 'object' && body !== null && (body.message || body.error || body.detail)) ||
    `Nexora request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new CommerceProviderError(message, {
      provider: 'nexora',
      operation,
      status,
      externalCode: 'AUTHENTICATION_ERROR',
    });
  }
  if (status === 404) {
    return new CommerceProviderError(message, {
      provider: 'nexora',
      operation,
      status,
      externalCode: 'NOT_FOUND',
    });
  }
  if (status === 409) {
    return new CommerceProviderError(message, {
      provider: 'nexora',
      operation,
      status,
      externalCode: 'CONFLICT',
    });
  }
  if (status === 422) {
    return new CommerceProviderError(message, {
      provider: 'nexora',
      operation,
      status,
      externalCode: 'VALIDATION_ERROR',
    });
  }
  if (status >= 500) {
    return new CommerceProviderError(message, {
      provider: 'nexora',
      operation,
      status,
      externalCode: 'UPSTREAM_ERROR',
    });
  }
  return new CommerceProviderError(message, {
    provider: 'nexora',
    operation,
    status,
    externalCode: 'HTTP_ERROR',
  });
}

/**
 * @returns {Promise<{ ok: boolean, status: number, data: any, rawText: string, headers: Headers }>}
 */
export async function nexoraRequest(method, path, { operation, query, body, timeoutMs, idempotencyKey } = {}) {
  const op = operation || `${method} ${path}`;
  const url = buildNexoraUrl(path, query);
  const timeout =
    timeoutMs ??
    parseInt(readConfigValue('NEXORA_REQUEST_TIMEOUT_MS', String(config.NEXORA_REQUEST_TIMEOUT_MS || 30000)), 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = {
    ...buildNexoraAuthHeaders(),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  let fetchBody;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let data = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    const envelope = typeof data === 'object' && data !== null ? data : null;

    console.log('[commerce-provider]', {
      provider: 'nexora',
      operation: op,
      status: response.status,
      resource: url.pathname,
    });

    if (!response.ok) {
      throw mapHttpError(response.status, envelope?.data ?? envelope ?? data, op);
    }
    if (envelope && envelope.success === false) {
      throw mapHttpError(response.status, envelope.data ?? envelope, op);
    }

    return {
      ok: true,
      status: response.status,
      data: envelope?.data ?? data,
      listMeta: envelope && 'items' in envelope ? envelope : null,
      rawText,
      headers: response.headers,
    };
  } catch (err) {
    if (err instanceof CommerceProviderError) {
      throw err;
    }
    if (err?.name === 'AbortError') {
      throw new CommerceProviderError(`Nexora request timed out after ${timeout}ms`, {
        provider: 'nexora',
        operation: op,
        externalCode: 'TIMEOUT',
        cause: err,
      });
    }
    throw new CommerceProviderError(err.message || 'Nexora network request failed', {
      provider: 'nexora',
      operation: op,
      externalCode: 'NETWORK_ERROR',
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function nexoraPing() {
  return nexoraRequest('GET', '/ping', { operation: 'ping' });
}
