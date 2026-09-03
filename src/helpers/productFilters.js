import { escapeRegex } from '#util/escapeRegex.js';

const BOOLEAN_FIELDS = ['liquidContents', 'heatSensitive', 'isFrozen'];

const FILTERABLE_PRODUCT_FIELDS = new Set([
  'name',
  'nameAr',
  'brand',
  'productSkuCode',
  'description',
  'descriptionAr',
  'status',
  'ean',
  'color',
  'size',
  'gender',
  'countryOfOrigin',
  'marketPlace',
  'categoryTrail',
  'productType',
  'source',
  'vatRateType',
  'shippingTime',
  'price',
  'msrp',
  'minPrice',
  'maxPrice',
  'purchasePrice',
  'shippingCost',
  'currentStockCount',
  'volumetricWeightCm',
  'numberOfItems',
  'hsCodeSA',
  'hsCodeAE',
  'noonPrice',
  'namshiPrice',
  'amazonPrice',
  'sixthStreetPrice',
  'styliPrice',
  'isFrozen',
  'liquidContents',
  'heatSensitive',
]);

const isAllowedField = (field) => {
  if (!field || typeof field !== 'string' || field.includes('.')) return false;
  return FILTERABLE_PRODUCT_FIELDS.has(field);
};

export function buildCondition(field, operator, value) {
  if (!isAllowedField(field)) return null;

  // Boolean fields (only equal / not equal )
  if (BOOLEAN_FIELDS.includes(field)) {
    if (typeof value !== 'string') return null;

    const v = value.toLowerCase();
    if (operator === 'equal_to') {
      if (v === 'true') return { [field]: true };
      if (v === 'false') return { [field]: false };
    }

    if (operator === 'not_equal_to') {
      if (v === 'true') return { [field]: { $ne: true } };
      if (v === 'false') return { [field]: { $ne: false } };
    }

    return null;
  }

  // Empty / Not Empty (valid for both string & number)
  if (operator === 'empty') {
    return { [field]: { $in: ['', null] } };
  }

  if (operator === 'not_empty') {
    return { [field]: { $nin: ['', null] } };
  }

  // Numeric operators
  const numeric_operators = ['less_than', 'greater_than'];

  if (numeric_operators.includes(operator) && !isNaN(value)) {
    const num = Number(value);

    switch (operator) {
      case 'equal_to':
        return { [field]: num };

      case 'not_equal_to':
        return { [field]: { $ne: num } };

      case 'less_than':
        return { [field]: { $lt: num } };

      case 'greater_than':
        return { [field]: { $gt: num } };

      default:
        return null;
    }
  }

  // String operators
  if (typeof value === 'string') {
    switch (operator) {
      case 'equal_to':
        return { [field]: value };

      case 'not_equal_to':
        return { [field]: { $ne: value } };

      case 'contains': {
        const pattern = escapeRegex(value);
        if (pattern === null) return null;
        return { [field]: { $regex: pattern, $options: 'i' } };
      }

      case 'does_not_contain': {
        const pattern = escapeRegex(value);
        if (pattern === null) return null;
        return { [field]: { $not: { $regex: pattern, $options: 'i' } } };
      }

      default:
        return null;
    }
  }

  return null;
}
