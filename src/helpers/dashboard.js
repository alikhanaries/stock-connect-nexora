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

export const growthWithTrend = (curr, prev) => {
  const c = +curr || 0;
  const p = +prev || 0;

  if (p <= 0) return { growth: c > 0 ? 100 : 0, trend: c > 0 ? 'up' : '' };

  const delta = ((c - p) / p) * 100;
  const growth = Math.round(Math.abs(delta) * 10) / 10;

  return delta > 0 ? { growth, trend: 'up' } : delta < 0 ? { growth, trend: 'down' } : { growth: 0, trend: '' };
};

export const extractCategoryLabel = (trail = '') => {
  if (typeof trail !== 'string') return '';
  const parts = trail
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || '';
};

export const topFacetPipeline = (sellerObjectId, range, type) => {
  const isCategory = type === 'category';

  return [
    { $match: { sellerId: sellerObjectId, orderDate: { $gte: range.start, $lte: range.end } } },
    { $unwind: '$orderSkuList.skuList' },
    {
      $lookup: {
        from: 'products',
        localField: 'orderSkuList.skuList.merchantProductNo',
        foreignField: 'productSkuCode',
        as: 'productMatch',
      },
    },
    { $match: { productMatch: { $ne: [] } } },
    {
      $facet: {
        items: [
          {
            $group: {
              _id: '$orderSkuList.skuList.merchantProductNo',
              product: {
                $first: isCategory
                  ? { $ifNull: [{ $arrayElemAt: ['$productMatch.categoryTrail', 0] }, 'Uncategorized'] }
                  : '$orderSkuList.skuList.description',
              },
              ordered: { $sum: '$orderSkuList.skuList.quantity' },
              revenue: { $sum: '$orderSkuList.skuList.lineTotalInclVat' },
            },
          },
          { $sort: { ordered: -1, revenue: -1, product: 1 } },
          { $limit: 5 },
        ],
        meta: [{ $group: { _id: '$orderSkuList.skuList.merchantProductNo' } }, { $count: 'total' }],
      },
    },
  ];
};

export const prevRevenuePipeline = (sellerObjectId, prevRange, keys) => [
  { $match: { sellerId: sellerObjectId, orderDate: { $gte: prevRange.start, $lte: prevRange.end } } },
  { $unwind: '$orderSkuList.skuList' },
  {
    $lookup: {
      from: 'products',
      localField: 'orderSkuList.skuList.merchantProductNo',
      foreignField: 'productSkuCode',
      as: 'productMatch',
    },
  },
  { $match: { productMatch: { $ne: [] } } },
  {
    $match: {
      'orderSkuList.skuList.merchantProductNo': { $in: keys },
    },
  },
  {
    $group: {
      _id: '$orderSkuList.skuList.merchantProductNo',
      prevRevenue: { $sum: '$orderSkuList.skuList.lineTotalInclVat' },
    },
  },
];

export default {
  getDateRange,
  getPreviousRange,
  normalizeSeries,
  buildAggregationPipeline,
  growthWithTrend,
  extractCategoryLabel,
  topFacetPipeline,
  prevRevenuePipeline,
};
