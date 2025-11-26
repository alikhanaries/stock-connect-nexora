export const extractMainImage = (pictures) => {
  if (!Array.isArray(pictures)) return null;

  const valid = pictures.filter((p) => p.picture && p.picture !== '');
  return valid.length > 0 ? valid[0].picture : null;
};

export const extractImages = (pictures) => {
  if (!Array.isArray(pictures)) return [];

  return pictures.filter((p) => p.picture && p.picture !== '').map((p) => p.picture);
};

export const extractMainVariantImage = (arr) => {
  if (!Array.isArray(arr)) return null;
  return arr.length > 0 ? arr[0].picture : null;
};

export const safeNumber = (val, min = 0) => Math.max(min, Number(val) || 0);
