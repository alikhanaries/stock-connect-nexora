import { connectNebim, getSessionId } from './connect.js';
import { handleNebimError } from './handleError.js';
import { nebimConfig } from '../config/config.js';
import { erpCommonConfig } from '#root/src/integrations/common/config/config.js';
const { RETRY_LIMIT } = erpCommonConfig;

export const fetchFromNebim = async (endpoint, options = {}) => {
  const { method = 'GET', headers = {}, body = null, query = {}, retries = RETRY_LIMIT } = options;
  const { BASE_URL } = nebimConfig;
  let sessionId = getSessionId();
  if (!sessionId) sessionId = await connectNebim();

  const sessionUrl = `${BASE_URL}/(S(${sessionId}))/${endpoint}`;

  const queryString = new URLSearchParams(query).toString();
  const url = `${sessionUrl}${queryString ? `?${queryString}` : ''}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      const shouldRetry = await handleNebimError(error, attempt, retries, endpoint);
      if (!shouldRetry) throw error;
    }
  }
};
