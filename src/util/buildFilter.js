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
