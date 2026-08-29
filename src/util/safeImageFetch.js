import dns from 'dns';
import net from 'net';

const FETCH_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024;

const FETCH_HEADERS = {
  Accept: 'image/jpeg,image/png,image/webp,image/gif',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
};

const isPrivateIpv4 = (parts) => {
  if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] >= 224) return true;
  return false;
};

const isPrivateIp = (address) => {
  if (!address) return true;

  if (net.isIPv4(address)) {
    return isPrivateIpv4(address.split('.').map(Number));
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    }
    return false;
  }

  return true;
};

const isBlockedHostname = (hostname) => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host === '0.0.0.0') return true;
  if (host === 'metadata.google.internal' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  return false;
};

const parseHttpsUrl = (imageUrl) => {
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error('invalid image url');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('image url must use https');
  }

  if (parsed.username || parsed.password) {
    throw new Error('image url must not contain credentials');
  }

  if (parsed.port && parsed.port !== '443') {
    throw new Error('image url port is not allowed');
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('image url host is not allowed');
  }

  return parsed;
};

export const validateSafeImageUrl = async (imageUrl) => {
  const parsed = parseHttpsUrl(imageUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('image url destination is not allowed');
    }
    return parsed;
  }

  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error('image url host could not be resolved');
  }

  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('image url destination is not allowed');
    }
  }

  return parsed;
};

const readLimitedBody = async (response, maxBytes) => {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error('image response exceeds size limit');
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('image response exceeds size limit');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
};

const resolveRedirectUrl = (currentUrl, location) => {
  if (!location) {
    throw new Error('redirect response missing location');
  }
  return new URL(location, currentUrl).toString();
};

export const fetchSafeImageBuffer = async (imageUrl) => {
  let currentUrl = imageUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await validateSafeImageUrl(currentUrl);

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error('image url exceeded redirect limit');
      }
      currentUrl = resolveRedirectUrl(currentUrl, response.headers.get('location'));
      continue;
    }

    if (!response.ok) {
      throw new Error(`image fetch failed with status ${response.status}`);
    }

    return readLimitedBody(response, MAX_BYTES);
  }

  throw new Error('image fetch failed');
};
