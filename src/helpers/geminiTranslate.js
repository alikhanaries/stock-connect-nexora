import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';
import { buildTranslatePrompt, TRANSLATE_SYSTEM_INSTRUCTION } from '#helpers/geminiPromptBuilders/translatePrompt.js';
import { BATCH_SIZE, SCRIPT_PATTERNS, LANG_CODE_TO_SCRIPT, LANG_CODE_TO_NAME } from '#constants/translate.js';

const apiKey = config.GEMINI_API_KEY;
if (!apiKey) throw new Error('[Gemini] GEMINI_API_KEY is not configured');

const ai = new GoogleGenAI({ apiKey });

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

const withTimeout = (promise, ms = 30000) =>
  Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`[Gemini] Request timed out after ${ms}ms`)), ms)),
  ]);

const callWithRetry = async (fn, retries = 6, onRetry) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn());
    } catch (error) {
      const is429 = error.message?.includes('429');
      const is503 = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
      const isExhausted =
        error.message?.includes('limit: 0') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.toLowerCase().includes('quota');

      if ((is429 || is503) && !isExhausted && attempt < retries) {
        const delay = is429 ? parseRetryDelay(error.message) : 30000 * attempt;
        const retryAfterSeconds = Math.ceil(delay / 1000);
        const label = is429 ? 'Rate limited' : 'Service unavailable';
        console.warn(
          `[Gemini] ${label}. Retrying in ${retryAfterSeconds}s (attempt ${attempt}/${retries}) — ${formatGeminiError(error.message)}`
        );
        onRetry?.({
          message: `${label}. Retrying in ${retryAfterSeconds}s`,
          type: is429 ? 'RATE_LIMIT' : 'SERVICE_UNAVAILABLE',
          retryAfterSeconds,
          attempt,
          totalRetries: retries,
        });
        await sleep(delay);
        onRetry?.(null);
      } else {
        error.geminiError = parseGeminiError(error.message);
        const reason = isExhausted
          ? 'Quota exhausted (limit: 0), not retrying'
          : `Final error after ${attempt} attempt(s)`;
        console.error(`[Gemini] ${reason} — ${formatGeminiError(error.message)}`);
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

export const setPendingProgress = (sellerId) =>
  progressStore.set(key(sellerId), { status: 'initializing', operations: [] });

export const initProgress = (sellerId, operations) =>
  progressStore.set(key(sellerId), {
    status: 'running',
    operations: operations.map(({ field, lang, total }) => ({
      field,
      lang,
      total,
      completed: 0,
      status: 'pending',
    })),
  });

const findOp = (p, field, lang) => p?.operations.find((o) => o.field === field && o.lang === lang);

export const startOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (op) op.status = 'running';
};

export const addProgress = (sellerId, field, lang, count) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (op) op.completed += count;
};

export const finishOperation = (sellerId, field, lang) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (op) {
    op.status = 'done';
    op.completed = op.total;
  }
};

export const failOperation = (sellerId, field, lang, error) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
  op.status = 'error';
  const g = error?.geminiError;
  const raw = g?.message ?? error?.message ?? 'Unknown error';
  op.error = { message: raw.split('\n')[0].split('. ')[0].trim() };
};

export const setOperationRetry = (sellerId, field, lang, retryInfo) => {
  const op = findOp(progressStore.get(key(sellerId)), field, lang);
  if (!op) return;
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
  p.status = hasError ? 'error' : 'done';
};

export const getProgress = (sellerId) => {
  const p = progressStore.get(key(sellerId));
  if (!p) return null;
  const completedOperations = p.operations.filter((o) => o.status === 'done').length;
  return {
    status: p.status,
    totalOperations: p.operations.length,
    completedOperations,
    operations: p.operations.map((o) => ({
      ...o,
      percentage: o.total > 0 ? Math.round((o.completed / o.total) * 100) : 0,
    })),
  };
};

const translateChunk = async (texts, targetLanguage, onRetry) => {
  const prompt = buildTranslatePrompt(texts, targetLanguage);

  const raw = await callWithRetry(
    async () => {
      const response = await ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: prompt,
        config: {
          maxOutputTokens: 65536,
          systemInstruction: TRANSLATE_SYSTEM_INSTRUCTION,
        },
      });
      return response.text.trim();
    },
    6,
    onRetry
  );

  const jsonStr = raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${jsonStr.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Gemini response was not an array (got ${typeof parsed})`);
  }

  return parsed;
};

export const translateBatch = async (texts, langCode, onProgress, onRetry) => {
  const targetLanguage = getLangName(langCode);
  const chunks = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    chunks.push(texts.slice(i, i + BATCH_SIZE));
  }

  console.log(`[Gemini] Translating ${texts.length} texts → ${targetLanguage} in ${chunks.length} chunk(s)`);

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Gemini] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} texts)`);
    const translated = await translateChunk(chunks[i], targetLanguage, onRetry);
    results.push(...translated);
    onProgress?.(chunks[i].length);
  }

  return results;
};
