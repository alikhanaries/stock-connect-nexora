import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supportedLangs = ['en', 'ar', 'zh', 'tr'];
const defaultLang = 'en';

const locales = {};

supportedLangs.forEach((lang) => {
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
  const lang = (req.headers['accept-language'] || defaultLang).toLowerCase();

  const chosenLang = supportedLangs.includes(lang) ? lang : defaultLang;

  req.locale = locales[chosenLang] || locales[defaultLang];
  req.lang = chosenLang;

  next();
};
