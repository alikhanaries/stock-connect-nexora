import { isDeepStrictEqual } from 'node:util';
export const makeComparableProductFromSchema = (product, ProductModel) => {
  const schemaPaths = Object.keys(ProductModel.schema.paths);

  const excluded = new Set(['_id', '__v', 'sellerId', 'productSkuCode', 'createdAt', 'updatedAt', 'syncedAt']);

  return Object.fromEntries(
    schemaPaths
      .filter((key) => !excluded.has(key))
      .map((key) => {
        let value = product[key];

        // Normalize undefined -> null
        if (value === undefined) value = null;

        // Optional: normalize empty strings to null
        if (typeof value === 'string' && value.trim() === '') value = null;

        return [key, value];
      })
  );
};

const IGNORED_FIELDS = new Set([
  // calculated / volatile
  'productType',
  'status',
  'marketPlace',

  // image derivatives
  'images',
  'primaryImageUrl',
  'imageUrl',
  ...Array.from({ length: 14 }, (_, i) => `extraImageUrl${i + 1}`),

  // system fields
  'createdAt',
  'updatedAt',
  'syncedAt',
]);

export const getChangedFields = (newObj = {}, oldObj = {}) => {
  const changes = {};

  for (const key of Object.keys(newObj)) {
    if (IGNORED_FIELDS.has(key)) continue;

    const newVal = newObj[key];
    const oldVal = oldObj[key];

    // both null / undefined → no change
    if (newVal == null && oldVal == null) continue;

    // deep compare (arrays, objects, primitives)
    if (!isDeepStrictEqual(newVal, oldVal)) {
      changes[key] = newVal;
    }
  }

  return changes;
};
