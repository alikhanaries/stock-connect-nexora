import { SOURCE_FIELD_MAP, LANG_CODE_TO_NAME } from '#constants/translate.js';

const FIELD_LABELS = {
  name: 'Name',
  description: 'Description',
  categoryTrail: 'Category Trail',
  color: 'Color',
  size: 'Size',
  brand: 'Brand',
};

const humanizeFieldName = (field) =>
  field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const langName = (lang) => LANG_CODE_TO_NAME[String(lang || '').toLowerCase()] || lang;

export const buildTranslateLabel = (field, lang) => {
  const sourceField = SOURCE_FIELD_MAP[field] ?? field;
  const fieldLabel = FIELD_LABELS[sourceField] ?? humanizeFieldName(sourceField);
  return `Translate ${fieldLabel} to ${langName(lang)}`;
};

export const CATEGORY_MAP_LABEL = 'Map Uncategorised SKUs';
export const ENHANCE_IMAGES_LABEL = 'Upscale Images';
