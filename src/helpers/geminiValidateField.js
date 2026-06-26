import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';
import {
  buildValidateFieldPrompt,
  VALIDATE_FIELD_SYSTEM_INSTRUCTION,
} from '#helpers/geminiPromptBuilders/validateFieldPrompt.js';
import {
  VALIDATE_BATCH_SIZE,
  VALIDATE_CHUNK_CONCURRENCY,
  VALIDATE_MAX_RETRIES,
  VALIDATE_REQUEST_TIMEOUT_MS,
  VALIDATE_MAX_OUTPUT_TOKENS,
  MAX_IMAGE_BYTES,
  DEFAULT_IMAGE_MIME,
  IMAGE_MIME_BY_EXTENSION,
} from '#constants/validateField.js';

const PROVIDER = (config.GEMINI_PROVIDER || 'gemini').toLowerCase();
const isVertex = PROVIDER === 'vertex';
const PROVIDER_LABEL = isVertex ? 'Vertex' : 'Gemini';

let _client = null;

const getAIClient = () => {
  if (_client) return _client;
  if (isVertex) {
    if (!config.GOOGLE_CLOUD_PROJECT) {
      throw new Error('[AI] GOOGLE_CLOUD_PROJECT is required when GEMINI_PROVIDER=vertex');
    }
    _client = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  } else {
    if (!config.GEMINI_API_KEY) {
      throw new Error('[AI] GEMINI_API_KEY is required when GEMINI_PROVIDER=gemini');
    }
    _client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return _client;
};

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      return reject(err);
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      },
      { once: true }
    );
  });

const parseRetryDelay = (errorMessage) => {
  const match = errorMessage?.match(/Please retry in ([\d.]+)s/);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : 15000;
};

const parseGeminiError = (message) => {
  try {
    const parsed = JSON.parse(message);
    return parsed?.error ?? parsed;
  } catch {
    return { message };
  }
};

const formatGeminiError = (raw) => {
  const e = parseGeminiError(raw);
  const parts = [e.code, e.status, e.message].filter(Boolean);
  return parts.length ? parts.join(' | ') : raw;
};

const withTimeout = (promise, ms = VALIDATE_REQUEST_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`[AI] Request timed out after ${ms}ms`)), ms)),
  ]);

const isAbortError = (error) => error?.name === 'AbortError' || error?.message?.toLowerCase().includes('aborted');

const callWithRetry = async (fn, retries = VALIDATE_MAX_RETRIES, onRetry, label = PROVIDER_LABEL, signal) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      return await withTimeout(fn());
    } catch (error) {
      if (isAbortError(error)) throw error;
      const is429 = error.message?.includes('429');
      const is503 = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
      const isTimeout = error.message?.includes('timed out');
      const isMalformed = error.retryable === true;
      const isExhausted =
        error.message?.includes('limit: 0') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.toLowerCase().includes('quota');

      if ((is429 || is503 || isTimeout || isMalformed) && !isExhausted && attempt < retries) {
        const delay = is429 ? parseRetryDelay(error.message) : isTimeout ? 10000 : isMalformed ? 5000 : 30000 * attempt;
        const retryAfterSeconds = Math.ceil(delay / 1000);
        const retryLabel = is429
          ? 'Rate limited'
          : isTimeout
            ? 'Request timed out'
            : isMalformed
              ? 'Incomplete model response'
              : 'High demand on AI service';
        console.warn(
          `[${label}] ${retryLabel}. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries}) — ${isTimeout || isMalformed ? error.message : formatGeminiError(error.message)}`
        );
        onRetry?.({ message: `${retryLabel}. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries})` });
        try {
          await sleep(delay, signal);
        } catch (abortErr) {
          onRetry?.(null);
          throw abortErr;
        }
        onRetry?.(null);
      } else {
        error.geminiError = parseGeminiError(error.message);
        const reason = isExhausted
          ? 'Quota exhausted (limit: 0), not retrying'
          : `Final error after ${attempt} attempt(s)`;
        console.error(`[${label}] ${reason} — ${isTimeout ? error.message : formatGeminiError(error.message)}`);
        throw error;
      }
    }
  }
};

const progressStore = new Map();
const key = (sellerId, field) => `${sellerId}:${field}`;

export const clearValidateFieldProgress = (sellerId, field) => {
  progressStore.delete(key(sellerId, field));
};

export const hasValidateFieldEntry = (sellerId, field) => progressStore.has(key(sellerId, field));

export const setPendingValidateFieldProgress = (sellerId, field) =>
  progressStore.set(key(sellerId, field), {
    field,
    status: 'pending',
    total: 0,
    completed: 0,
    updated: 0,
    cancelRequested: false,
    pauseRequested: false,
    abortController: null,
  });

export const initValidateFieldProgress = (
  sellerId,
  field,
  total,
  { preserveCompleted = false, retryMode = false } = {}
) => {
  const prior = progressStore.get(key(sellerId, field));
  if (retryMode) {
    progressStore.set(key(sellerId, field), {
      field,
      status: 'running',
      total,
      completed: 0,
      updated: 0,
      retryInfo: null,
      error: null,
      cancelRequested: false,
      pauseRequested: false,
      abortController: null,
    });
    return;
  }
  const wasCancelled = prior?.cancelRequested === true;
  const priorCompleted = prior?.completed ?? 0;
  const priorUpdated = prior?.updated ?? 0;
  const priorTotal = prior?.total ?? 0;
  progressStore.set(key(sellerId, field), {
    field,
    status: wasCancelled ? 'cancelled' : 'running',
    total: preserveCompleted ? priorTotal : total,
    completed: preserveCompleted ? priorCompleted : 0,
    updated: preserveCompleted ? priorUpdated : 0,
    retryInfo: null,
    error: null,
    cancelRequested: wasCancelled,
    pauseRequested: false,
    abortController: null,
  });
};

export const setValidateFieldAbortController = (sellerId, field, ac) => {
  const p = progressStore.get(key(sellerId, field));
  if (p) p.abortController = ac ?? null;
};

export const isValidateFieldCancelled = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  return p?.cancelRequested === true;
};

export const isValidateFieldStopped = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  return p?.cancelRequested === true || p?.pauseRequested === true;
};

export const cancelValidateField = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return null;
  if (['done', 'error', 'cancelled'].includes(p.status)) return null;
  const previous = p.status;
  p.cancelRequested = true;
  p.status = 'cancelled';
  p.retryInfo = null;
  p.error = null;
  try {
    p.abortController?.abort();
  } catch {
    /* ignore */
  }
  p.abortController = null;
  return previous;
};

export const pauseValidateField = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return null;
  if (['done', 'error', 'cancelled', 'paused'].includes(p.status)) return null;
  const previous = p.status;
  p.pauseRequested = true;
  p.status = 'paused';
  try {
    p.abortController?.abort();
  } catch {
    /* ignore */
  }
  p.abortController = null;
  return previous;
};

export const resumeValidateField = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return null;
  if (p.status !== 'paused') return null;
  p.pauseRequested = false;
  p.status = 'pending';
  return 'paused';
};

const RETRIABLE_STATUSES = new Set(['error', 'cancelled', 'paused', 'done']);
export const retryValidateField = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return null;
  if (!RETRIABLE_STATUSES.has(p.status)) return null;
  const previous = p.status;
  p.completed = 0;
  p.updated = 0;
  p.cancelRequested = false;
  p.pauseRequested = false;
  p.retryInfo = null;
  p.error = null;
  p.status = 'pending';
  p.abortController = null;
  return previous;
};

export const addValidateFieldProgress = (sellerId, field, completedDelta, updatedDelta = 0) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return;
  p.completed += completedDelta;
  p.updated += updatedDelta;
};

export const setValidateFieldRetry = (sellerId, field, retryInfo) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return;
  if (p.cancelRequested || p.status === 'cancelled') return;
  if (p.pauseRequested || p.status === 'paused') return;
  p.retryInfo = retryInfo || null;
};

export const failValidateFieldProgress = (sellerId, field, error) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return;
  if (p.status === 'cancelled' || p.cancelRequested) return;
  if (p.status === 'paused' || p.pauseRequested) return;
  p.status = 'error';
  p.abortController = null;
  const g = error?.geminiError;
  const raw = g?.message ?? error?.message ?? 'Unknown error';
  p.error = { message: raw.split('\n')[0].split('. ')[0].trim() };
};

export const finishValidateFieldProgress = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return;
  if (!['error', 'cancelled', 'paused'].includes(p.status)) p.status = 'done';
  p.abortController = null;
};

export const getValidateFieldProgress = (sellerId, field) => {
  const p = progressStore.get(key(sellerId, field));
  if (!p) return null;
  return {
    field: p.field,
    status: p.status,
    total: p.total ?? 0,
    completed: p.completed ?? 0,
    updated: p.updated ?? 0,
    percentage: p.status === 'done' ? 100 : p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
    retryInfo: p.retryInfo ?? null,
    error: p.error ?? null,
  };
};

const guessMimeFromUrl = (url) => {
  const path = url.split('?')[0].toLowerCase();
  const dot = path.lastIndexOf('.');
  if (dot === -1) return DEFAULT_IMAGE_MIME;
  return IMAGE_MIME_BY_EXTENSION[path.slice(dot)] ?? DEFAULT_IMAGE_MIME;
};

const fetchImageAsInlinePart = async (url, signal) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const mimeType = contentType.startsWith('image/') ? contentType.split(';')[0].trim() : guessMimeFromUrl(url);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    return { inlineData: { mimeType, data: buf.toString('base64') } };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
};

const validateChunk = async (chunk, field, fieldConfig, onRetry, abortSignal) => {
  const client = getAIClient();

  const imageParts = await Promise.all(
    chunk.map((p) => (p.imageUrl ? fetchImageAsInlinePart(p.imageUrl, abortSignal) : Promise.resolve(null)))
  );

  const enriched = chunk.map((p, i) => ({ ...p, hasImage: Boolean(imageParts[i]) }));
  const promptText = buildValidateFieldPrompt(enriched, field, fieldConfig);

  const parts = [{ text: promptText }];
  imageParts.forEach((part, i) => {
    if (!part) return;
    parts.push({ text: `[image ${i}]` });
    parts.push(part);
  });

  return callWithRetry(
    async () => {
      const response = await client.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          maxOutputTokens: VALIDATE_MAX_OUTPUT_TOKENS,
          systemInstruction: VALIDATE_FIELD_SYSTEM_INSTRUCTION,
          ...(abortSignal ? { abortSignal } : {}),
        },
      });
      const raw = (response.text ?? '').trim();
      const jsonStr = raw
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const finishReason = response.candidates?.[0]?.finishReason;
      const reasonHint = finishReason && finishReason !== 'STOP' ? ` (finishReason: ${finishReason})` : '';

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        const err = new Error(`AI returned non-JSON response${reasonHint}: ${jsonStr.slice(0, 200)}`);
        err.retryable = true;
        throw err;
      }

      let indexed;
      if (Array.isArray(parsed)) {
        indexed = parsed.reduce((acc, val, i) => {
          if (typeof val === 'string') acc[i] = val;
          return acc;
        }, {});
      } else if (parsed && typeof parsed === 'object') {
        indexed = parsed;
      } else {
        const err = new Error(`AI response was not an object or array (got ${typeof parsed})${reasonHint}`);
        err.retryable = true;
        throw err;
      }

      const result = chunk.map((_, i) => {
        const v = indexed[String(i)] ?? indexed[i];
        if (typeof v !== 'string') return null;
        const trimmed = v.trim();
        if (!trimmed) return null;
        const normalized = fieldConfig.normalize ? fieldConfig.normalize(trimmed) : trimmed;
        if (!normalized) return null;
        if (fieldConfig.allowedSet && !fieldConfig.allowedSet.has(normalized)) return null;
        return normalized;
      });

      const got = result.filter((v) => v !== null).length;
      if (got === 0) {
        const err = new Error(`AI response had no usable ${field} values (expected ${chunk.length})${reasonHint}`);
        err.retryable = true;
        throw err;
      }
      if (got < chunk.length) {
        console.warn(`[AI] Partial response: ${got}/${chunk.length} ${field} values returned${reasonHint}`);
      }
      return result;
    },
    VALIDATE_MAX_RETRIES,
    onRetry,
    PROVIDER_LABEL,
    abortSignal
  );
};

export const classifyValidateBatch = async (
  products,
  field,
  fieldConfig,
  onChunk,
  onRetry,
  isCancelled,
  abortSignal
) => {
  const chunks = [];
  for (let i = 0; i < products.length; i += VALIDATE_BATCH_SIZE) {
    chunks.push(products.slice(i, i + VALIDATE_BATCH_SIZE));
  }

  console.log(
    `[AI] Provider: ${PROVIDER_LABEL} | Validating ${field} for ${products.length} products in ${chunks.length} chunk(s), concurrency: ${VALIDATE_CHUNK_CONCURRENCY}`
  );

  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      if (isCancelled?.()) return;
      const i = cursor++;
      const startIndex = i * VALIDATE_BATCH_SIZE;
      console.log(`[AI] Sending ${field}-validate chunk ${i + 1}/${chunks.length} (${chunks[i].length} products)`);
      let result;
      try {
        result = await validateChunk(chunks[i], field, fieldConfig, onRetry, abortSignal);
      } catch (err) {
        if (isCancelled?.() || isAbortError(err)) return;
        throw err;
      }
      if (isCancelled?.()) return;
      await onChunk?.(result, startIndex, chunks[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(VALIDATE_CHUNK_CONCURRENCY, chunks.length) }, worker));
};
