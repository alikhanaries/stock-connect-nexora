import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';
import {
  buildCategoryMapPrompt,
  CATEGORY_MAP_SYSTEM_INSTRUCTION,
} from '#helpers/geminiPromptBuilders/categoryMapPrompt.js';

const PROVIDER = (config.GEMINI_PROVIDER || 'gemini').toLowerCase();
const isVertex = PROVIDER === 'vertex';
const PROVIDER_LABEL = isVertex ? 'Vertex' : 'Gemini';

const CATEGORY_BATCH_SIZE = 20;
const CHUNK_CONCURRENCY = 3;
const MAX_RETRIES = 6;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const withTimeout = (promise, ms = 120000) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`[AI] Request timed out after ${ms}ms`)), ms)),
  ]);

const callWithRetry = async (fn, retries = MAX_RETRIES, onRetry, label = PROVIDER_LABEL) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn());
    } catch (error) {
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
        await sleep(delay);
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

// ---------------- Progress store ----------------
const progressStore = new Map();
const key = (sellerId) => String(sellerId);

export const clearCategoryMapProgress = (sellerId) => {
  progressStore.delete(key(sellerId));
};

// "pending" mirrors translate-op semantics so the UI renders "Queued" for the
// category-map row while it waits for the translate phase to finish.
export const setPendingCategoryMapProgress = (sellerId) =>
  progressStore.set(key(sellerId), { status: 'pending', total: 0, completed: 0, updated: 0 });

export const initCategoryMapProgress = (sellerId, total) =>
  progressStore.set(key(sellerId), {
    status: 'running',
    total,
    completed: 0,
    updated: 0,
    retryInfo: null,
    error: null,
  });

export const addCategoryMapProgress = (sellerId, completedDelta, updatedDelta = 0) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return;
  p.completed += completedDelta;
  p.updated += updatedDelta;
};

export const setCategoryMapRetry = (sellerId, retryInfo) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return;
  p.retryInfo = retryInfo || null;
};

export const failCategoryMapProgress = (sellerId, error) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return;
  p.status = 'error';
  const g = error?.geminiError;
  const raw = g?.message ?? error?.message ?? 'Unknown error';
  p.error = { message: raw.split('\n')[0].split('. ')[0].trim() };
};

export const finishCategoryMapProgress = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return;
  if (p.status !== 'error') p.status = 'done';
};

export const getCategoryMapProgress = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return null;
  return {
    status: p.status,
    total: p.total ?? 0,
    completed: p.completed ?? 0,
    updated: p.updated ?? 0,
    percentage: p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
    retryInfo: p.retryInfo ?? null,
    error: p.error ?? null,
  };
};

// ---------------- Gemini call ----------------
const classifyChunk = async (chunk, allowedPaths, pathSet, onRetry) => {
  const prompt = buildCategoryMapPrompt(chunk, allowedPaths);
  const client = getAIClient();

  return callWithRetry(
    async () => {
      const response = await client.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
        config: {
          maxOutputTokens: 16384,
          systemInstruction: CATEGORY_MAP_SYSTEM_INSTRUCTION,
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
        // enforce that AI returned a value from the allowed list
        if (!pathSet.has(trimmed)) return null;
        return trimmed;
      });

      const got = result.filter((v) => v !== null).length;
      if (got === 0) {
        const err = new Error(`AI response had no usable category matches (expected ${chunk.length})${reasonHint}`);
        err.retryable = true;
        throw err;
      }
      if (got < chunk.length) {
        console.warn(`[AI] Partial response: ${got}/${chunk.length} products classified${reasonHint}`);
      }
      return result;
    },
    MAX_RETRIES,
    onRetry,
    PROVIDER_LABEL
  );
};

export const classifyProductsBatch = async (products, allowedPaths, pathSet, onChunk, onRetry) => {
  const chunks = [];
  for (let i = 0; i < products.length; i += CATEGORY_BATCH_SIZE) {
    chunks.push(products.slice(i, i + CATEGORY_BATCH_SIZE));
  }

  console.log(
    `[AI] Provider: ${PROVIDER_LABEL} | Classifying ${products.length} products against ${allowedPaths.length} categories in ${chunks.length} chunk(s), concurrency: ${CHUNK_CONCURRENCY}`
  );

  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      const i = cursor++;
      const startIndex = i * CATEGORY_BATCH_SIZE;
      console.log(`[AI] Sending category chunk ${i + 1}/${chunks.length} (${chunks[i].length} products)`);
      const result = await classifyChunk(chunks[i], allowedPaths, pathSet, onRetry);
      await onChunk?.(result, startIndex, chunks[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, worker));
};
