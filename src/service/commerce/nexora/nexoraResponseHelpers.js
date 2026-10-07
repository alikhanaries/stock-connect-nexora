export function buildFetchLikeResponse(status, body, { ok = status >= 200 && status < 300, headers = {} } = {}) {
  const headerObj = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  return {
    ok,
    status,
    headers: new Headers(headerObj),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => {
      const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
      return new TextEncoder().encode(text).buffer;
    },
  };
}

export function buildPushLikeResponse({ ok, status, data, rawText = '' }) {
  return {
    ok,
    status,
    data,
    rawText,
    json: async () => data,
    text: async () => rawText || (typeof data === 'string' ? data : JSON.stringify(data ?? '')),
  };
}
