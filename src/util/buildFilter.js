import mongoose from 'mongoose';
const escaped = (str) => str.replace(/[-^$*+?.()|[\]{}]/g, '\\$&');

export const buildFilter = ({ rawFilters = [], sellerId, search, channelName, buildCondition }) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }

  let filters = Array.isArray(rawFilters) ? rawFilters : [];

  if (filters.length && typeof filters[0] === 'string') {
    filters = [
      {
        conditions: filters.map((f) => {
          const [field, operator, ...rest] = f.split(':');
          return { field, operator, value: rest.join(':') };
        }),
      },
    ];
  }

  const orQueries = [];

  for (const group of filters) {
    if (!Array.isArray(group.conditions)) continue;

    const andQueries = group.conditions.map((c) => buildCondition(c.field, c.operator, c.value)).filter(Boolean);

    if (andQueries.length === 1) orQueries.push(andQueries[0]);
    else if (andQueries.length > 1) orQueries.push({ $and: andQueries });
  }

  let finalFilter = {
    sellerId: new mongoose.Types.ObjectId(sellerId),
    status: { $ne: 'removed' },
  };

  if (orQueries.length === 1) {
    finalFilter = { ...finalFilter, ...orQueries[0] };
  } else if (orQueries.length > 1) {
    finalFilter.$or = orQueries;
  }

  if (channelName) {
    finalFilter.marketPlace = {
      $regex: escaped(channelName),
      $options: 'i',
    };
  }

  if (search) {
    const regex = new RegExp(escaped(search), 'i');
    const searchOr = [{ name: regex }, { productSkuCode: regex }];

    finalFilter.$or = finalFilter.$or ? [...finalFilter.$or, ...searchOr] : searchOr;
  }

  return finalFilter;
};

const NUMERIC_FIELDS = new Set([
  'price',
  'msrp',
  'currentStockCount',
  'numberOfItems',
  'shippingCost',
  'volumetricWeightCm',
]);

const STRING_NUMERIC_FIELDS = new Set(['shippingTime']);

const castNumeric = (field, val) => {
  if (!NUMERIC_FIELDS.has(field)) return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : val;
};

const buildExprCondition = (field, op, value) => ({
  $expr: {
    [op]: [{ $toInt: `$${field}` }, Number(value)],
  },
});

//Filter casting to handle numeric fields
export const castFilter = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(castFilter);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if ((k === '$or' || k === '$and') && Array.isArray(v)) {
      out[k] = v.map(castFilter);
      continue;
    }

    if (STRING_NUMERIC_FIELDS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      const exprs = Object.entries(v).map(([op, val]) => buildExprCondition(k, op, val));
      out.$and = out.$and ? out.$and.concat(exprs) : exprs;
      continue;
    }

    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ops = {};
      for (const [op, ov] of Object.entries(v)) ops[op] = castNumeric(k, ov);
      out[k] = ops;
      continue;
    }
    out[k] = castNumeric(k, v);
  }
  return out;
};
