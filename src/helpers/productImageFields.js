/** Named extra image slots: extraImageUrl1 … extraImageUrl14 (15 images with primary). */
export const EXTRA_IMAGE_FIELD_COUNT = 14;

export const EXTRA_IMAGE_URL_KEYS = Array.from({ length: EXTRA_IMAGE_FIELD_COUNT }, (_, i) => `extraImageUrl${i + 1}`);

export const NAMED_IMAGE_URL_KEYS = ['primaryImageUrl', 'imageUrl', ...EXTRA_IMAGE_URL_KEYS];

export const CHANNEL_ENGINE_EXTRA_IMAGE_KEYS = Array.from(
  { length: EXTRA_IMAGE_FIELD_COUNT },
  (_, i) => `ExtraImageUrl${i + 1}`
);

/**
 * ERP / Shopify style: primaryImageUrl and imageUrl both from images[0];
 * extraImageUrlN from images[N].
 */
export const mapErpStyleImageFields = (images = []) => {
  const list = (Array.isArray(images) ? images : []).filter(Boolean);
  const fields = {
    primaryImageUrl: list[0] || null,
    imageUrl: list[0] || null,
  };
  for (let i = 1; i <= EXTRA_IMAGE_FIELD_COUNT; i++) {
    fields[`extraImageUrl${i}`] = list[i] || null;
  }
  return { ...fields, images: list };
};

/**
 * CSV import style: primary=[0], imageUrl=[1], extraImageUrlN=[N+1].
 * Preserves column positions — empty middle slots stay empty (no collapse).
 * `images` is the non-empty URLs in column order.
 */
export const mapCsvStyleImageFields = (slots = []) => {
  const list = Array.isArray(slots) ? slots : [];
  const fields = {
    primaryImageUrl: list[0] || null,
    imageUrl: list[1] || null,
  };
  for (let i = 1; i <= EXTRA_IMAGE_FIELD_COUNT; i++) {
    fields[`extraImageUrl${i}`] = list[i + 1] || null;
  }
  return {
    ...fields,
    images: list.filter(Boolean),
  };
};

/**
 * Collect CSV image columns as a fixed-length slot array (primary, imageUrl, extras 1–14).
 * Empty cells are kept as '' so later columns keep their exact positions.
 */
export const collectCsvImageSlotsFromRow = (r = {}) => {
  const urls = [r.primaryimageurl || '', r.imageurl || ''];
  for (let i = 1; i <= EXTRA_IMAGE_FIELD_COUNT; i++) {
    urls.push(r[`extraimageurl${i}`] || '');
  }
  return urls;
};

/** ChannelEngine ExtraImageUrl1…ExtraImageUrl14 from product document. */
export const mapProductToChannelEngineImageFields = (product = {}) => {
  const fields = {};
  for (let i = 1; i <= EXTRA_IMAGE_FIELD_COUNT; i++) {
    fields[`ExtraImageUrl${i}`] = product[`extraImageUrl${i}`] || null;
  }
  return fields;
};

/** Copy named image URL fields (+ optional images) from a source object. */
export const pickNamedImageFields = (source = {}, { includeImages = true } = {}) => {
  const fields = {};
  for (const key of NAMED_IMAGE_URL_KEYS) {
    if (source[key] !== undefined) fields[key] = source[key];
  }
  if (includeImages && source.images !== undefined) {
    fields.images = source.images;
  }
  return fields;
};

/** CSV export values for extraImageUrl1…14 in header order. */
export const exportExtraImageUrlValues = (product = {}) => EXTRA_IMAGE_URL_KEYS.map((key) => product[key] || '');
