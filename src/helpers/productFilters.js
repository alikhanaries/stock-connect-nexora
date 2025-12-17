export function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined && v !== null && v !== '').map((v) => String(v).trim());
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  if (value === undefined || value === null) return [];

  return [String(value).trim()];
}

export function buildCondition(field, operator, value) {
  const BOOLEAN_FIELDS = ['liquidContents', 'heatSensitive'];

  if (BOOLEAN_FIELDS.includes(field)) {
    if (typeof value !== 'string') return null;

    const v = value.toLowerCase();
    if (v === 'true') return { [field]: true };
    if (v === 'false') return { [field]: false };
    return null;
  }

  const num = Number(value);
  if (value === undefined || value === null) return null;

  switch (operator) {
    // Arithmetic
    case 'equal_to':
      return { [field]: num };
    case 'not_equal_to':
      return { [field]: { $ne: num } };
    case 'less_than':
      return { [field]: { $lt: num } };
    case 'not_less_than':
      return { [field]: { $gte: num } };
    case 'greater_than':
      return { [field]: { $gt: num } };
    case 'not_greater_than':
      return { [field]: { $lte: num } };

    // Text
    case 'empty':
      return { [field]: '' };
    case 'not_empty':
      return { [field]: { $exists: true, $ne: '' } };
    case 'contains':
      return { [field]: { $regex: value, $options: 'i' } };
    case 'does_not_contain':
      return { [field]: { $not: { $regex: value, $options: 'i' } } };

    // List
    case 'in_list':
      return { [field]: { $in: normalizeArray(value) } };
    case 'not_in_list':
      return { [field]: { $nin: normalizeArray(value) } };

    // Equals
    case 'equals':
      return { [field]: value };
    case 'not_equals':
      return { [field]: { $ne: value } };

    // Multi-match
    case 'contains_any': {
      const list = normalizeArray(value);
      return list.length ? { $or: list.map((v) => ({ [field]: { $regex: v, $options: 'i' } })) } : null;
    }
    case 'does_not_contains_any': {
      const list = normalizeArray(value);
      return list.length ? { $and: list.map((v) => ({ [field]: { $not: { $regex: v, $options: 'i' } } })) } : null;
    }

    default:
      return null;
  }
}