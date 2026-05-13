import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';
import { BATCH_SIZE, SCRIPT_PATTERNS, LANG_CODE_TO_SCRIPT, LANG_CODE_TO_NAME } from '#constants/translate.js';
import { buildTranslatePrompt, TRANSLATE_SYSTEM_INSTRUCTION } from '#helpers/geminiPromptBuilders/translatePrompt.js';

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

const callWithRetry = async (fn, retries = 6) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn());
    } catch (error) {
      const is429 = error.message?.includes('429');
      const is503 = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
      if ((is429 || is503) && attempt < retries) {
        const delay = is429 ? parseRetryDelay(error.message) : 30000 * attempt;
        console.warn(
          `[Gemini] ${is429 ? 'Rate limited' : 'Service unavailable'}. Retrying in ${delay / 1000}s (attempt ${attempt}/${retries}) — ${formatGeminiError(error.message)}`
        );
        await sleep(delay);
      } else {
        error.geminiError = parseGeminiError(error.message);
        console.error(`[Gemini] Final error after ${attempt} attempt(s) — ${formatGeminiError(error.message)}`);
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

const translateChunk = async (texts, targetLanguage) => {
  const prompt = buildTranslatePrompt(texts, targetLanguage);

  const raw = await callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 65536,
        systemInstruction: TRANSLATE_SYSTEM_INSTRUCTION,
      },
    });
    return response.text.trim();
  });

  const jsonStr = raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(jsonStr);
};

export const translateBatch = async (texts, langCode) => {
  const targetLanguage = getLangName(langCode);
  const chunks = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    chunks.push(texts.slice(i, i + BATCH_SIZE));
  }

  console.log(`[Gemini] Translating ${texts.length} texts → ${targetLanguage} in ${chunks.length} request(s)`);

  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Gemini] Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} texts)`);
    const translated = await translateChunk(chunks[i], targetLanguage);
    results.push(...translated);
  }

  return results;
};
