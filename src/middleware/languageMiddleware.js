import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGE_CODES } from '#constants/common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultLang = 'en';

const locales = {};

LANGUAGE_CODES.forEach((lang) => {
  try {
    const filePath = path.join(__dirname, `../locales/${lang}.json`);
    const data = fs.readFileSync(filePath, 'utf-8');
    locales[lang] = JSON.parse(data);
  } catch (err) {
    console.error(`Failed to load locale for ${lang}:`, err.message);
    locales[lang] = {}; // fallback to empty object
  }
});

export const loadLocale = (lang) => {
  return locales[lang] || locales['en'] || {};
};

export const checkLanguage = (req, res, next) => {
  const lang = req.headers['accept-language'] || defaultLang;

  const chosenLang = LANGUAGE_CODES.includes(lang) ? lang : defaultLang;

  req.locale = locales[chosenLang] || locales[defaultLang];
  req.lang = chosenLang;
  next();
};
