export async function executeChannelEngineRequest({ method, url, body, headers = {} }) {
  const fetchHeaders = { ...headers };
  let fetchBody = body;

  if (body !== undefined && body !== null) {
    const contentType = fetchHeaders['Content-Type'] || fetchHeaders['content-type'] || 'application/json';
    if (!fetchHeaders['Content-Type']) {
      fetchHeaders['Content-Type'] = contentType;
    }
    if (typeof body !== 'string' && contentType.includes('application/json')) {
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

    console.error(`❌ [ChannelEngine API Error] ${method} ${url}`);
    console.error(`   Status Code: ${response.status}`);
    console.error(`   Request Body:`, typeof body === 'object' ? JSON.stringify(body, null, 2) : body);
    console.error(`   Error Response:`, typeof data === 'object' ? JSON.stringify(data, null, 2) : rawText);
  } else {
    console.log(`✅ [ChannelEngine API Success] ${method} ${url} (Status: ${response.status})`);
  }

  return {
    ok,
    status: response.status,
    data,
    rawText,
    errorMessage,
  };
}
