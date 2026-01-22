export const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const getDateRange = (period, offset = 0) => {
  if (!['today', 'weekly', 'monthly'].includes(period)) return null;

  const now = new Date();
  let start, end;

  if (period === 'today') {
    start = new Date(startOfDay(now).getTime() + offset * DAY_MS);
    end = endOfDay(start);
  }

  if (period === 'weekly') {
    const endDate = new Date(startOfDay(now).getTime() + offset * 7 * DAY_MS);
    start = new Date(endDate.getTime() - 6 * DAY_MS);
    end = endOfDay(endDate);
  }

  if (period === 'monthly') {
    const year = now.getFullYear();
    const month = now.getMonth() + offset;

    start = new Date(year, month, 1);
    end = endOfDay(new Date(year, month + 1, 0));
  }

  return { start, end };
};

export const getPreviousRange = (period, currentRange) => {
  const { start } = currentRange;

  switch (period) {
    case 'today': {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      return {
        start: new Date(y.setHours(0, 0, 0, 0)),
        end: new Date(y.setHours(23, 59, 59, 999)),
      };
    }
    case 'weekly':
      return {
        start: new Date(start.getTime() - 7 * DAY_MS),
        end: new Date(start.getTime() - 1),
      };
    case 'monthly':
      return {
        start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
        end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
      };
  }
};

export const buildAggregationPipeline = ({ sellerObjectId, period, metric, range }) => {
  const isMonthly = period === 'monthly';
  const isToday = period === 'today';

  const groupId = isMonthly
    ? {
        week: {
          $ceil: { $divide: [{ $dayOfMonth: '$orderDate' }, 7] },
        },
      }
    : isToday
      ? {
          hour: {
            $dateToString: {
              format: '%H:00',
              date: {
                $dateTrunc: {
                  date: '$orderDate',
                  unit: 'hour',
                  binSize: 3,
                  timezone: 'UTC',
                },
              },
              timezone: 'UTC',
            },
          },
        }
      : {
          date: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$orderDate',
              timezone: 'UTC',
            },
          },
        };

  const valueExpression =
    metric === 'sales'
      ? {
          $sum: {
            $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$totalInclVat', 0],
          },
        }
      : { $sum: 1 };

  return [
    {
      $match: {
        sellerId: sellerObjectId,
        orderDate: { $gte: range.start, $lte: range.end },
      },
    },
    { $group: { _id: groupId, value: valueExpression } },
    {
      $sort: isMonthly ? { '_id.week': 1 } : isToday ? { '_id.hour': 1 } : { '_id.date': 1 },
    },
  ];
};

const toISODate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const buildDayBuckets = (start, end) => {
  const out = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);

  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (cur <= last) {
    out.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

const normalizeMonthlyWeeks = (raw = []) => {
  if (!raw.length) {
    return Array.from({ length: 5 }, (_, i) => ({
      label: `Week ${i + 1}`,
      value: 0,
    }));
  }

  const map = new Map(raw.map((r) => [r._id.week, r.value]));
  const maxWeek = Math.max(...map.keys());

  return Array.from({ length: maxWeek }, (_, i) => {
    const week = i + 1;
    return {
      label: `Week ${week}`,
      value: map.get(week) || 0,
    };
  });
};

const normalizeTodayHours = (raw) => {
  const map = new Map(raw.map((r) => [r._id.hour, r.value]));

  const labels = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

  return labels.map((label) => ({
    label,
    value: map.get(label) || 0,
  }));
};

export const normalizeSeries = (period, raw = [], range) => {
  if (!range?.start || !range?.end) return [];

  if (period === 'monthly') {
    return normalizeMonthlyWeeks(raw);
  }

  if (period === 'today') {
    return normalizeTodayHours(raw);
  }

  const map = new Map(raw.map((r) => [r._id.date, r.value]));
  const days = buildDayBuckets(range.start, range.end);

  return days.map((d) => ({
    label: d,
    value: map.get(d) || 0,
  }));
};

export const buildInventoryStatusPipeline = (sellerObjectId, range) => {
  const match = {
    sellerId: sellerObjectId,
    productSkuCode: { $type: 'string', $ne: '' },
    ...(range ? { updatedAt: { $gte: range.start, $lte: range.end } } : {}),
  };

  return [
    { $match: match },
    { $group: { _id: '$productSkuCode' } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'productSkuCode',
        as: 'product',
        pipeline: [{ $project: { _id: 0, status: 1, isFrozen: 1 } }],
      },
    },
    {
      $addFields: {
        finalStatus: {
          $cond: [
            { $eq: [{ $size: '$product' }, 0] },
            'other',
            {
              $let: {
                vars: {
                  s: {
                    $toLower: {
                      $trim: {
                        input: {
                          $toString: { $first: '$product.status' },
                        },
                      },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $eq: ['$$s', 'active'] },
                    'active',
                    {
                      $cond: [{ $eq: ['$$s', 'inactive'] }, 'inactive', 'other'],
                    },
                  ],
                },
              },
            },
          ],
        },

        freezeStatus: {
          $cond: [
            { $gt: [{ $size: '$product' }, 0] },
            {
              $cond: [
                { $eq: [{ $type: { $first: '$product.isFrozen' } }, 'bool'] },
                {
                  $cond: [{ $eq: [{ $first: '$product.isFrozen' }, true] }, 'freeze', 'unfreeze'],
                },
                '$$REMOVE',
              ],
            },
            '$$REMOVE',
          ],
        },
      },
    },
    {
      $facet: {
        statusCounts: [
          { $group: { _id: '$finalStatus', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ],
        freezeCounts: [
          { $match: { freezeStatus: { $in: ['freeze', 'unfreeze'] } } },
          { $group: { _id: '$freezeStatus', count: { $sum: 1 } } },
          { $project: { _id: 0, status: '$_id', count: 1 } },
        ],
      },
    },
  ];
};

export default {
  getDateRange,
  getPreviousRange,
  normalizeSeries,
  buildAggregationPipeline,
  buildInventoryStatusPipeline,
};
