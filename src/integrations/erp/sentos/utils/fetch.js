import { sentosConfig } from '../config/config.js';
import { SENTOS_FETCH_TIMEOUT_MS, SENTOS_MAX_RETRIES } from '../constants/common.js';
import { formatSentosFetchError, logSentosError, logSentosInfo, logSentosWarn } from './logger.js';

const buildAuthHeader = () => {
  const token = Buffer.from(`${sentosConfig.SENTOS_API_KEY}:${sentosConfig.SENTOS_API_PASSWORD}`).toString('base64');
  return `Basic ${token}`;
};

const summarizeBody = (data) => {
  if (data == null) return null;
  if (typeof data === 'string') return data.slice(0, 200);
  try {
    return JSON.stringify(data).slice(0, 200);
  } catch {
    return '[unserializable]';
  }
};

export const sentosFetch = async (path, options = {}) => {
  const cleanPath = String(path || '').replace(/^\//, '');
  const url = `${sentosConfig.SENTOS_API_URL}/${cleanPath}`;
  const logContext = options.logContext || 'API';

  for (let attempt = 1; attempt <= SENTOS_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SENTOS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: buildAuthHeader(),
          ...(options.headers || {}),
        },
      });

      clearTimeout(timeout);

      const text = await response.text();
      let data = null;

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      const rateLimit = formatSentosFetchError(response, cleanPath).rateLimit;

      if (!response.ok) {
        logSentosWarn('HTTP error from Sentos', {
          context: logContext,
          attempt,
          maxAttempts: SENTOS_MAX_RETRIES,
          status: response.status,
          path: cleanPath,
          rateLimit,
          body: summarizeBody(data),
        });
        throw new Error(`Sentos API ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      }

      logSentosInfo('HTTP OK', {
        context: logContext,
        path: cleanPath,
        attempt,
        rateLimit,
      });

      return data;
    } catch (err) {
      clearTimeout(timeout);
      const waitMs = attempt * 1000;

      if (attempt >= SENTOS_MAX_RETRIES) {
        logSentosError('Request failed after all retries', {
          context: logContext,
          path: cleanPath,
          message: err.message,
          name: err.name,
        });
        throw err;
      }

      logSentosWarn('Request failed, retrying', {
        context: logContext,
        path: cleanPath,
        attempt,
        waitMs,
        message: err.message,
        name: err.name,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return null;
};
