import { sentosConfig } from '../config/config.js';
import { SENTOS_FETCH_TIMEOUT_MS, SENTOS_MAX_RETRIES } from '../constants/common.js';

const buildAuthHeader = () => {
  const token = Buffer.from(`${sentosConfig.SENTOS_API_KEY}:${sentosConfig.SENTOS_API_PASSWORD}`).toString('base64');
  return `Basic ${token}`;
};

export const sentosFetch = async (path, options = {}) => {
  const cleanPath = String(path || '').replace(/^\//, '');
  const url = `${sentosConfig.SENTOS_API_URL}/${cleanPath}`;

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

      if (!response.ok) {
        throw new Error(`Sentos API ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= SENTOS_MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return null;
};
