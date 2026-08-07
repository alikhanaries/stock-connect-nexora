/**
 * fetch() wrapper with retry/backoff for transient failures — 429 (rate limit),
 * 5xx, and network errors. Used for direct ChannelEngine GET calls (order/product
 * reads) that aren't already routed through the queued channelEnginePush retry path.
 *
 * Respects a numeric Retry-After header (seconds) when present on a 429; otherwise
 * backs off exponentially. Non-retryable responses (2xx, 4xx other than 429) are
 * returned as-is on the first attempt — callers keep their existing !response.ok
 * handling unchanged.
 */
export async function fetchWithRetry(url, options = {}, { maxAttempts = 4, baseDelayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) throw err;
      await sleep(retryDelayMs(attempt, baseDelayMs));
      continue;
    }

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === maxAttempts) {
      return response;
    }

    const retryAfterHeader = Number(response.headers?.get?.('Retry-After'));
    const delayMs =
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : retryDelayMs(attempt, baseDelayMs);

    console.warn(
      `fetchWithRetry: ${url} responded ${response.status}, retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`
    );
    await sleep(delayMs);
  }

  throw lastError || new Error(`fetchWithRetry: exhausted ${maxAttempts} attempts for ${url}`);
}

const retryDelayMs = (attempt, baseDelayMs) => baseDelayMs * 2 ** (attempt - 1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
