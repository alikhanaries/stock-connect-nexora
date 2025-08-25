import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supportedLangs = ['en', 'ar', 'cn', 'tr'];
const defaultLang = 'en';

// Load JSON files dynamically
const loadLocale = (lang) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, `../locales/${lang}.json`), 'utf-8'));
  } catch (err) {
    console.log(err);
    console.error(`Missing locale file for ${lang}, falling back to EN`);
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../locales/en.json'), 'utf-8'));
  }
};

export const checkLanguage = (req, res, next) => {
  const lang = (req.headers['accept-language'] || defaultLang).toLowerCase();
  const chosenLang = supportedLangs.includes(lang) ? lang : defaultLang;

  req.locale = loadLocale(chosenLang);
  req.lang = chosenLang;

  next();
};
