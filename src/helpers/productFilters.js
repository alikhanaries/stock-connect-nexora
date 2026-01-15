export function buildCondition(field, operator, value) {
  const BOOLEAN_FIELDS = ['liquidContents', 'heatSensitive'];

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

      case 'contains':
        return { [field]: { $regex: value, $options: 'i' } };

      case 'does_not_contain':
        return { [field]: { $not: { $regex: value, $options: 'i' } } };

      default:
        return null;
    }
  }

  return null;
}
