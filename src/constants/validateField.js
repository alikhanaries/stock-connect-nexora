export const VALIDATE_FIELD_OPTIONS = [
  { option: 'validateColor', field: 'color' },
  { option: 'validateGender', field: 'gender' },
];

export const VALIDATE_FIELDS = VALIDATE_FIELD_OPTIONS.map((v) => v.field);

export const VALIDATE_FIELD_LABELS = {
  color: 'Validate Color from Image',
  gender: 'Validate Gender from Image',
};

export const VALIDATE_BATCH_SIZE = 6;
export const VALIDATE_CHUNK_CONCURRENCY = 2;
export const VALIDATE_MAX_RETRIES = 6;
export const VALIDATE_REQUEST_TIMEOUT_MS = 180_000;
export const VALIDATE_MAX_OUTPUT_TOKENS = 8192;
export const VALIDATE_SCOPE_BATCH_SIZE = 120;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_IMAGE_MIME = 'image/jpeg';
export const IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heic',
};

export const VALIDATE_FIELD_RULES = {
  color: {
    instructions: [
      'Pick the dominant visible color of the product itself, not the background, packaging, or props.',
      'Return a single canonical color name in lowercase English (e.g. "black", "white", "navy blue", "burgundy", "beige", "olive green").',
      'For multi-color products, use the most prominent color or a compact phrase such as "black and white".',
      'Always derive the color independently from the image, name, and description. Ignore any value the seller may have set — your job is to overwrite it with the correct one.',
    ],
  },
  gender: {
    allowed: ['Male', 'Female', 'Unisex'],
    synonyms: {
      male: 'Male',
      men: 'Male',
      man: 'Male',
      boy: 'Male',
      boys: 'Male',
      female: 'Female',
      women: 'Female',
      woman: 'Female',
      girl: 'Female',
      girls: 'Female',
      ladies: 'Female',
      unisex: 'Unisex',
      neutral: 'Unisex',
      'gender neutral': 'Unisex',
    },
    instructions: [
      'Return exactly one of: "Male", "Female", "Unisex".',
      'Use the product image (cut, silhouette, styling) plus the name and description (e.g. "men", "women", "ladies", "boys", "girls", "unisex").',
      'When the product is clearly targeted at one gender, choose Male or Female. When evidence is ambiguous or the item is genuinely gender-neutral, return "Unisex".',
      'Always derive gender independently from the image, name, and description. Ignore any value the seller may have set — your job is to overwrite it with the correct one.',
    ],
  },
};
