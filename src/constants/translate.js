export const BATCH_SIZE = 500;

export const SCRIPT_PATTERNS = {
  ar: /[؀-ۿݐ-ݿࢠ-ࣿ]/,
  zh: /[一-鿿㐀-䶿]/,
  ja: /[぀-ヿㇰ-ㇿ]/,
  ko: /[가-힯ᄀ-ᇿ]/,
};

export const LANG_CODE_TO_SCRIPT = {
  ar: 'ar',
  arabic: 'ar',
};

export const LANG_CODE_TO_NAME = {
  en: 'English',
  ar: 'Arabic',
  tr: 'Turkish',
};
