import mongoose from 'mongoose';

export const buildFilter = ({ rawFilters = [], sellerId, search, channelName, buildCondition }) => {
  let filters = rawFilters;

  if (Array.isArray(filters) && typeof filters[0] === 'string') {
    filters = [
      {
        conditions: filters.map((f) => {
          const [field, operator, ...rest] = f.split(':');
          return {
            field,
            operator,
            value: rest.join(':'),
          };
        }),
      },
    ];
  }

  const orQueries = [];

  for (const group of filters) {
    if (!Array.isArray(group.conditions) || !group.conditions.length) continue;

    const andQueries = [];

    for (const cond of group.conditions) {
      const built = buildCondition(cond.field, cond.operator, cond.value);
      if (built && Object.keys(built).length) {
        andQueries.push(built);
      }
    }

    if (andQueries.length === 1) orQueries.push(andQueries[0]);
    else if (andQueries.length > 1) orQueries.push({ $and: andQueries });
  }

  let finalFilter = {};
  if (orQueries.length === 1) finalFilter = orQueries[0];
  else if (orQueries.length > 1) finalFilter = { $or: orQueries };

  finalFilter = {
    ...finalFilter,
    sellerId: new mongoose.Types.ObjectId(sellerId),
    status: { $ne: 'removed' },
  };

  if (channelName) {
    const escaped = channelName.replace(/[-^$*+?.()|[\]{}]/g, '\\$&');
    finalFilter.marketPlace = { $regex: escaped, $options: 'i' };
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    finalFilter.$or = finalFilter.$or
      ? [...finalFilter.$or, { name: regex }, { productSkuCode: regex }]
      : [{ name: regex }, { productSkuCode: regex }];
  }

  return finalFilter;
};
