export async function executeChannelEngineRequest({ method, url, body, headers = {} }) {
  const fetchHeaders = { ...headers };
  let fetchBody = body;

  if (body !== undefined && body !== null && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
    if (typeof body !== 'string') {
      fetchBody = JSON.stringify(body);
    }
  }

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: fetchBody,
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

  const ok = response.ok;
  let errorMessage = null;

  if (!ok) {
    errorMessage =
      (typeof data === 'object' && data !== null && (data.Message || data.message || data.errorMessage)) ||
      rawText ||
      `HTTP ${response.status}`;
  }

  return {
    ok,
    status: response.status,
    data,
    rawText,
    errorMessage,
  };
}
