import { uniCommerceConfig } from '../config/config.js';

const normalizeBaseUrl = (url) => url.replace(/\/+$/, '');

export const postToUniwareProxy = async (endpoint, body, { merchantId }) => {
  const { GENERIC_PROXY_URL, CLIENT_ID, SECURITY_KEY } = uniCommerceConfig;

  if (!GENERIC_PROXY_URL || !CLIENT_ID || !SECURITY_KEY || !merchantId) {
    throw new Error('UniCommerce generic proxy is not fully configured');
  }

  const url = `${normalizeBaseUrl(GENERIC_PROXY_URL)}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      clientid: CLIENT_ID,
      merchantid: merchantId,
      securitykey: SECURITY_KEY,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
};

export default postToUniwareProxy;
