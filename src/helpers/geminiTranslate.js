import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';
import { buildTranslatePrompt, TRANSLATE_SYSTEM_INSTRUCTION } from '#helpers/geminiPromptBuilders/translatePrompt.js';
import { BATCH_SIZE, SCRIPT_PATTERNS, LANG_CODE_TO_SCRIPT, LANG_CODE_TO_NAME } from '#constants/translate.js';

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

const withTimeout = (promise, ms = 90000) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`[AI] Request timed out after ${ms}ms`)), ms)),
  ]);

const isAbortError = (error) => error?.name === 'AbortError' || error?.message?.toLowerCase().includes('aborted');

const callWithRetry = async (fn, retries = 6, onRetry, label = PROVIDER_LABEL, signal) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (signal?.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      return await withTimeout(fn());
    } catch (error) {
      // Abort = user cancelled. Don't retry, don't log noise — let the worker handle it.
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
              : 'High demand on translation service';
        const userMessage = is503
          ? `High demand right now. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries})`
          : `${retryLabel}. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries})`;
        console.warn(
          `[${label}] ${retryLabel}. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries}) — ${isTimeout || isMalformed ? error.message : formatGeminiError(error.message)}`
        );
        onRetry?.({ message: userMessage });
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

const detectScript = (text) => {
  for (const [script, pattern] of Object.entries(SCRIPT_PATTERNS)) {
    if (pattern.test(text)) return script;
  }
  return 'latin';
};

export const isAlreadyInLang = (text, langCode) => {
  const code = langCode.toLowerCase();
  const targetScript = LANG_CODE_TO_SCRIPT[code];
  if (!targetScript) return false;

  return detectScript(text) === targetScript;
};

export const getLangName = (langCode) => LANG_CODE_TO_NAME[langCode.toLowerCase()] ?? langCode;

// In-memory progress store keyed by sellerId string
const progressStore = new Map();
const key = (sellerId) => String(sellerId);

export const clearProgress = (sellerId) => {
  progressStore.delete(key(sellerId));
};

export const hasProgressEntry = (sellerId) => progressStore.has(key(sellerId));

export const setPendingProgress = (sellerId, translateFields = []) =>
  progressStore.set(key(sellerId), {
    status: 'initializing',
    operations: translateFields.map(({ field, lang }) => ({
      field,
      lang,
      total: 0,
      completed: 0,
      status: 'pending',
      cancelRequested: false,
      pauseRequested: false,
      abortController: null,
    })),
  });

export const initProgress = (
  sellerId,
  operations,
  { totalProducts = 0, preserveCompleted = false, retryMode = false } = {}
) => {
  const prior = progressStore.get(key(sellerId));

  if (preserveCompleted && prior?.operations) {
    const incomingByKey = new Map(operations.map((o) => [`${o.field}:${o.lang}`, o]));
    prior.status = 'running';
    if (typeof totalProducts === 'number') prior.totalProducts = totalProducts;
    prior.operations = prior.operations.map((op) => {
      const incoming = incomingByKey.get(`${op.field}:${op.lang}`);
      if (!incoming) return op;
      const priorCompleted = op.completed ?? 0;
      const wasCancelled = op.cancelRequested === true;
      return {
        ...op,
        total: op.total,
        completed: priorCompleted,
        status: wasCancelled ? 'cancelled' : 'pending',
        cancelRequested: wasCancelled,
        pauseRequested: false,
        abortController: null,
      };
    });
    return;
  }

  if (retryMode && prior?.operations) {
    const incomingByKey = new Map(operations.map((o) => [`${o.field}:${o.lang}`, o]));
    prior.status = 'running';
    if (typeof totalProducts === 'number') prior.totalProducts = totalProducts;
    prior.operations = prior.operations.map((op) => {
      const incoming = incomingByKey.get(`${op.field}:${op.lang}`);
      if (!incoming) return op;
      return {
        ...op,
        total: totalProducts,
        completed: 0,
        error: null,
        retryInfo: null,
        status: 'pending',
        cancelRequested: false,
        pauseRequested: false,
        abortController: null,
      };
    });
    return;
  }

  const priorOp = (field, lang) => prior?.operations?.find((o) => o.field === field && o.lang === lang);
  progressStore.set(key(sellerId), {
    status: 'running',
    totalProducts,
    updatedProducts: prior?.updatedProducts ?? 0,
    operations: operations.map(({ field, lang }) => {
      const prev = priorOp(field, lang);
      const wasCancelled = prev?.cancelRequested === true;
      const wasPaused = prev?.pauseRequested === true;
      return {
        field,
        lang,
        total: totalProducts,
        completed: 0,
        status: wasCancelled ? 'cancelled' : 'pending',
        cancelRequested: wasCancelled,
        pauseRequested: wasPaused,
        abortController: null,
      };
    }),
  });
};

export const setUpdatedProducts = (sellerId, count) => {
  const p = progressStore.get(key(sellerId));
  if (p) p.updatedProducts = count;
};

const findOp = (p, field, lang) => p?.operations.find((o) => o.field === field && o.lang === lang);

export const startOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
  // Don't flip a cancelled/paused op back to running — the user already issued an explicit stop.
  if (op.cancelRequested || op.status === 'cancelled') return;
  if (op.pauseRequested || op.status === 'paused') return;
  op.status = 'running';
};

export const addProgress = (sellerId, field, lang, count) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
  op.completed = Math.min((op.completed ?? 0) + count, op.total ?? Infinity);
};

export const finishOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (op) {
    op.status = 'done';
    op.abortController = null;
  }
};

export const failOperation = (sellerId, field, lang, error) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
  // If the user already cancelled or paused this op, don't downgrade to error —
  // an in-flight chunk failing after stop is expected, not a real failure.
  if (op.status === 'cancelled' || op.cancelRequested) return;
  if (op.status === 'paused' || op.pauseRequested) return;
  op.status = 'error';
  op.abortController = null;
  const g = error?.geminiError;
  const raw = g?.message ?? error?.message ?? 'Unknown error';
  op.error = { message: raw.split('\n')[0].split('. ')[0].trim() };
};

export const setOperationAbortController = (sellerId, field, lang, ac) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (op) op.abortController = ac ?? null;
};

export const isOperationCancelled = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  return op?.cancelRequested === true;
};
export const isOperationStopped = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  return op?.cancelRequested === true || op?.pauseRequested === true;
};

const TERMINAL_STATUSES = ['done', 'error', 'cancelled'];
const NOT_PAUSABLE = [...TERMINAL_STATUSES, 'paused'];

const applyCancelToOp = (op) => {
  op.cancelRequested = true;
  op.status = 'cancelled';
  delete op.error;
  delete op.retryInfo;
  try {
    op.abortController?.abort();
  } catch {
    /* ignore */
  }
  op.abortController = null;
};

const applyPauseToOp = (op) => {
  op.pauseRequested = true;
  op.status = 'paused';
  try {
    op.abortController?.abort();
  } catch {
    /* ignore */
  }
  op.abortController = null;
};

export const cancelOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op || TERMINAL_STATUSES.includes(op.status)) return null;
  const previous = op.status;
  applyCancelToOp(op);
  return previous;
};

export const cancelAllOperations = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return [];
  const cancelled = [];
  for (const op of p.operations) {
    if (TERMINAL_STATUSES.includes(op.status)) continue;
    cancelled.push({ field: op.field, lang: op.lang, previous: op.status });
    applyCancelToOp(op);
  }
  return cancelled;
};

export const pauseOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op || NOT_PAUSABLE.includes(op.status)) return null;
  const previous = op.status;
  applyPauseToOp(op);
  return previous;
};

export const pauseAllOperations = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return [];
  const paused = [];
  for (const op of p.operations) {
    if (NOT_PAUSABLE.includes(op.status)) continue;
    paused.push({ field: op.field, lang: op.lang, previous: op.status });
    applyPauseToOp(op);
  }
  return paused;
};

export const resumeOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op || op.status !== 'paused') return null;
  op.pauseRequested = false;
  op.status = 'pending';
  return 'paused';
};

// Resume every op currently paused.
export const resumeAllPausedOperations = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return [];
  const resumed = [];
  for (const op of p.operations) {
    if (op.status !== 'paused') continue;
    resumed.push({ field: op.field, lang: op.lang, completed: op.completed ?? 0 });
    op.pauseRequested = false;
    op.status = 'pending';
  }
  return resumed;
};

const RETRIABLE_STATUSES = new Set(['error', 'cancelled', 'paused', 'done']);

const applyRetryToOp = (op) => {
  op.completed = 0;
  op.cancelRequested = false;
  op.pauseRequested = false;
  delete op.error;
  delete op.retryInfo;
  op.status = 'pending';
  op.abortController = null;
};

export const retryOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op || !RETRIABLE_STATUSES.has(op.status)) return null;
  const previous = op.status;
  applyRetryToOp(op);
  return previous;
};

// Retry every op in a retriable terminal state. Returns the list of {field,lang,previous}.
export const retryAllOperations = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return [];
  const retried = [];
  for (const op of p.operations) {
    if (!RETRIABLE_STATUSES.has(op.status)) continue;
    retried.push({ field: op.field, lang: op.lang, previous: op.status });
    applyRetryToOp(op);
  }
  return retried;
};

export const listOperationStatuses = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return [];
  return p.operations.map((o) => ({ field: o.field, lang: o.lang, status: o.status, completed: o.completed ?? 0 }));
};

export const setOperationRetry = (sellerId, field, lang, retryInfo) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
  if (op.cancelRequested || op.status === 'cancelled') return;
  if (op.pauseRequested || op.status === 'paused') return;
  if (retryInfo) {
    op.retryInfo = retryInfo;
  } else {
    delete op.retryInfo;
  }
};

export const finishProgress = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return;
  const hasError = p.operations.some((o) => o.status === 'error');
  const hasPaused = p.operations.some((o) => o.status === 'paused');
  const hasDone = p.operations.some((o) => o.status === 'done');
  const hasCancelled = p.operations.some((o) => o.status === 'cancelled');
  if (hasError) p.status = 'error';
  else if (hasPaused) p.status = 'paused';
  else if (hasDone) p.status = 'done';
  else if (hasCancelled) p.status = 'cancelled';
  else p.status = 'done';
};

export const getProgress = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return null;
  const completedOperations = p.operations.filter((o) => o.status === 'done').length;
  return {
    status: p.status,
    totalProducts: p.totalProducts ?? 0,
    updatedProducts: p.updatedProducts ?? 0,
    totalOperations: p.operations.length,
    completedOperations,
    operations: p.operations.map((o) => ({
      field: o.field,
      lang: o.lang,
      total: o.total ?? 0,
      completed: o.completed ?? 0,
      status: o.status,
      error: o.error ?? null,
      retryInfo: o.retryInfo ?? null,
      percentage: o.total > 0 ? Math.round((o.completed / o.total) * 100) : 0,
    })),
  };
};

const translateChunk = async (texts, targetLanguage, onRetry, abortSignal) => {
  const prompt = buildTranslatePrompt(texts, targetLanguage);
  const client = getAIClient();

  return callWithRetry(
    async () => {
      const response = await client.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
        config: {
          maxOutputTokens: 65536,
          systemInstruction: TRANSLATE_SYSTEM_INSTRUCTION,
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

      // Accept either indexed object {"0": "...", "1": "..."} or legacy array form
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

      const result = texts.map((_, i) => {
        const v = indexed[String(i)] ?? indexed[i];
        return typeof v === 'string' && v.trim() ? v : null;
      });

      const got = result.filter((v) => v !== null).length;
      if (got === 0) {
        const err = new Error(`AI response had no usable translations (expected ${texts.length})${reasonHint}`);
        err.retryable = true;
        throw err;
      }
      if (got < texts.length) {
        console.warn(`[AI] Partial response: ${got}/${texts.length} items translated${reasonHint}`);
      }
      return result;
    },
    6,
    onRetry,
    PROVIDER_LABEL,
    abortSignal
  );
};

const CHUNK_CONCURRENCY = 3;

export const translateBatch = async (texts, langCode, onProgress, onRetry, onChunk, isCancelled, abortSignal) => {
  const targetLanguage = getLangName(langCode);
  const chunks = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    chunks.push(texts.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `[AI] Provider: ${PROVIDER_LABEL} | Translating ${texts.length} texts → ${targetLanguage} in ${chunks.length} chunk(s), concurrency: ${CHUNK_CONCURRENCY}`
  );

  const results = new Array(chunks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      if (isCancelled?.()) return;
      const i = cursor++;
      const startIndex = i * BATCH_SIZE;
      console.log(`[AI] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} texts)`);
      try {
        results[i] = await translateChunk(chunks[i], targetLanguage, onRetry, abortSignal);
      } catch (err) {
        if (isCancelled?.() || isAbortError(err)) return;
        throw err;
      }
      if (isCancelled?.()) return;
      await onChunk?.(results[i], startIndex);
      onProgress?.(chunks[i].length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));

  return results.flat();
};
