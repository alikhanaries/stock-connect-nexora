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

export const getChangedFields = (newObj, oldObj) => {
  if (!oldObj) return newObj;
  const ignoredFields = ['productType']; // any other calculated fields
  return Object.fromEntries(
    Object.keys(newObj)
      .filter((key) => {
        if (ignoredFields.includes(key)) return false; // ignore calculated fields
        const newVal = newObj[key];
        const oldVal = oldObj[key];

        // ignore null/undefined
        if (newVal == null) return false;

        return newVal !== oldVal;
      })
      .map((key) => [key, newObj[key]])
  );
};
