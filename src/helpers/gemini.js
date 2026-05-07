import { GoogleGenAI } from '@google/genai';
import { config } from '#config/config.js';

const apiKey = config.GEMINI_API_KEY;
console.log('[Gemini] Loaded API key:', apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'MISSING');
console.log('[Gemini] Model:', config.GEMINI_MODEL);

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

const callWithRetry = async (fn, retries = 6) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const is429 = error.message?.includes('429');
      const is503 = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
      if ((is429 || is503) && attempt < retries) {
        const delay = is429 ? parseRetryDelay(error.message) : 30000 * attempt; // 30s, 60s, 90s, 120s, 150s
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

// Script detection via Unicode ranges — no extra library needed
const SCRIPT_PATTERNS = {
  ar: /[؀-ۿݐ-ݿࢠ-ࣿ]/,
  zh: /[一-鿿㐀-䶿]/,
  ja: /[぀-ヿㇰ-ㇿ]/,
  ko: /[가-힯ᄀ-ᇿ]/,
};

const LANG_CODE_TO_SCRIPT = {
  ar: 'ar',
  arabic: 'ar',
};

const LANG_CODE_TO_NAME = {
  en: 'English',
  ar: 'Arabic',
  tr: 'Turkish',
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

  // Latin-script languages (en, tr, fr, …) share the same Unicode range —
  // we can't distinguish them without a full language model, so never skip.
  if (!targetScript) return false;

  // For non-Latin targets (ar, zh, ja, ko): skip only if text is already in that script.
  return detectScript(text) === targetScript;
};

export const getLangName = (langCode) => LANG_CODE_TO_NAME[langCode.toLowerCase()] ?? langCode;

const BATCH_SIZE = 500;

const translateChunk = async (texts, targetLanguage) => {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `You are a professional translator. Translate each of the following texts to ${targetLanguage}. For proper nouns and brand names that have no standard translation, transliterate them phonetically into the target script (e.g. "Manijero" → "مانيجيرو" in Arabic). Return ONLY a valid JSON array of translated strings in the same order as the input. No explanation, no markdown, no extra text — just the JSON array.\n\n${numbered}`;

  const raw = await callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: prompt,
      config: { maxOutputTokens: 65536 },
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
