import { CHANNEL_TO_GLOBAL_NAMES } from '#constants/dashboard.js';
export const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

export const parseDateParam = (s) => {
  if (!s || typeof s !== 'string') return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    return isValidDate(dt) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }

  const dmY = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmY) {
    const d = Number(dmY[1]);
    const m = Number(dmY[2]);
    const y = Number(dmY[3]);
    const dt = new Date(y, m - 1, d);
    return isValidDate(dt) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }

  return null;
};

export const parseMonthParam = (s) => {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s); // YYYY-MM
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
};

export const getDateRange = (input, offset = 0) => {
  const now = new Date();

  const period = typeof input === 'string' ? input : input?.period;
  const month = typeof input === 'string' ? null : input?.month;
  const startDate = typeof input === 'string' ? null : input?.startDate;
  const endDate = typeof input === 'string' ? null : input?.endDate;

  // Custom overrides period (if both provided)
  if (startDate || endDate) {
    const s = parseDateParam(startDate);
    const e = parseDateParam(endDate);
    if (!s || !e) throw new Error('Invalid startDate/endDate. Use YYYY-MM-DD or DD/MM/YYYY.');
    if (s.getTime() > e.getTime()) throw new Error('startDate must be <= endDate.');

    return { start: startOfDay(s), end: endOfDay(e), kind: 'custom', days: null };
  }

  if (!period) return null;

  // Rolling last_N_days
  const rolling = /^last_(\d+)_days$/.exec(period);
  if (rolling) {
    const n = Number(rolling[1]);
    if (!Number.isFinite(n) || n <= 0) return null;

    const end = endOfDay(now);
    const start = new Date(startOfDay(now).getTime() - (n - 1) * DAY_MS);
    return { start, end, kind: 'rolling', days: n };
  }

  if (period === 'all') {
    const start = new Date(2024, 0, 1);
    start.setHours(0, 0, 0, 0);

    return {
      start,
      end: endOfDay(now),
      kind: 'all',
      days: null,
    };
  }

  if (!['today', 'weekly', 'monthly', 'month'].includes(period)) return null;

  let start, end;

  if (period === 'today') {
    start = new Date(startOfDay(now).getTime() + offset * DAY_MS);
    end = endOfDay(start);
    return { start, end, kind: 'today', days: 1 };
  }

  if (period === 'weekly') {
    const startOfWeekMon = (d) => {
      const day = d.getDay();
      const diff = (day + 6) % 7;
      return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff));
    };

    const base = new Date(now.getTime() + offset * 7 * DAY_MS);
    start = startOfWeekMon(base);
    end = endOfDay(new Date(start.getTime() + 6 * DAY_MS));

    return { start, end, kind: 'weekly', days: 7 };
  }

  if (period === 'monthly') {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    start = startOfDay(base);
    end = endOfDay(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    return { start, end, kind: 'monthly', days: null };
  }

  if (period === 'month') {
    const parsed = parseMonthParam(month);
    if (!parsed) throw new Error('Invalid month. Use "YYYY-MM" (e.g., 2026-05).');
    start = new Date(parsed.year, parsed.monthIndex, 1);
    end = endOfDay(new Date(parsed.year, parsed.monthIndex + 1, 0));
    return { start, end, kind: 'month', days: null };
  }

  return null;
};

export const getPreviousRange = (period, currentRange) => {
  const { start, end, kind, days } = currentRange;

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
  if (kind === 'rolling') {
    const n = Number(days) || 0;
    return {
      start: new Date(start.getTime() - n * DAY_MS),
      end: new Date(end.getTime() - n * DAY_MS),
    };
  }

  if (kind === 'month') {
    return {
      start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
      end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
    };
  }

  if (kind === 'custom') {
    const durationMs = end.getTime() - start.getTime() + 1; // inclusive
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
    return {
      start: startOfDay(prevStart),
      end: endOfDay(prevEnd),
    };
  }

  return undefined;
};

export const isComparablePeriod = (period) =>
  ['today', 'weekly', 'monthly', 'month'].includes(period) || /^last_(\d{1,3})_days$/.test(period);

export const buildAggregationPipeline = ({ sellerObjectIds, period, metric, range, ...globalChannelFilter }) => {
  const isMonthly = period === 'monthly';
  const isToday = period === 'today';
  const isAll = period === 'all';

  const groupId = isMonthly
    ? {
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$orderDate',
          },
        },
      }
    : isAll
      ? {
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: '$orderDate',
              timezone: 'UTC',
            },
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

  const pipeline = [
    {
      $match: {
        sellerId: { $in: sellerObjectIds },
        orderDate: { $gte: range.start, $lte: range.end },
        ...globalChannelFilter,
      },
    },
  ];
  if (metric === 'sales') {
    pipeline.push({
      $unwind: { path: '$orderSkuList.skuList', preserveNullAndEmptyArrays: false },
    });
  }

  pipeline.push({
    $group: {
      _id: groupId,
      value:
        metric === 'sales'
          ? {
              $sum: {
                $multiply: [
                  { $ifNull: ['$orderSkuList.skuList.statusBreakdown.delivered', 0] },
                  { $ifNull: ['$orderSkuList.skuList.originalUnitPriceInclVat', 0] },
                ],
              },
            }
          : { $sum: 1 },
    },
  });

  pipeline.push({
    $sort: isMonthly ? { '_id.date': 1 } : isAll ? { '_id.month': 1 } : isToday ? { '_id.hour': 1 } : { '_id.date': 1 },
  });

  return pipeline;
};

const toISODate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const toISOMonth = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
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

const buildMonthBuckets = (start, end) => {
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= last) {
    out.push(toISOMonth(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
};

const normalizeMonthlyWeeks = (raw = [], range) => {
  const map = new Map(raw.map((r) => [r._id.date, r.value ?? 0]));

  const days = [];
  let cur = new Date(range.start);

  while (cur <= range.end) {
    const label = cur.toISOString().slice(0, 10); // YYYY-MM-DD
    days.push({ label, value: map.get(label) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }

  return days;
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
    return normalizeMonthlyWeeks(raw, range);
  }

  if (period === 'today') {
    return normalizeTodayHours(raw);
  }

  if (period === 'all') {
    const map = new Map(raw.map((r) => [r._id.month, r.value]));
    const months = buildMonthBuckets(range.start, range.end);

    return months.map((m) => ({
      label: m,
      value: map.get(m) || 0,
    }));
  }

  const map = new Map(raw.map((r) => [r._id.date, r.value]));
  const days = buildDayBuckets(range.start, range.end);

  return days.map((d) => ({
    label: d,
    value: map.get(d) || 0,
  }));
};

export const buildInventoryStatusPipeline = (sellerObjectIds, range, channelId) => {
  const match = {
    sellerId: { $in: sellerObjectIds },
    productSkuCode: { $type: 'string', $ne: '' },
    ...(range ? { updatedAt: { $gte: range.start, $lte: range.end } } : {}),
  };

  const channelIds = String(channelId ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const productLookupPipeline = [
    ...(channelIds.length ? [{ $match: { channelId: { $in: channelIds } } }] : []),
    { $project: { _id: 0, status: 1, isFrozen: 1 } },
  ];

  return [
    { $match: match },
    { $group: { _id: '$productSkuCode' } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'productSkuCode',
        as: 'product',
        pipeline: productLookupPipeline,
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
        totalCount: [{ $count: 'count' }],
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

export const growthWithTrend = (curr, prev) => {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;

  if (p === 0) {
    if (c === 0) return { growth: 0, trend: 'neutral' };
    return { growth: null, trend: 'up' };
  }

  if (p < 0) return { growth: null, trend: c >= 0 ? 'up' : 'down' };

  const delta = ((c - p) / p) * 100;
  const growth = Math.round(Math.abs(delta) * 10) / 10;

  if (delta > 0) return { growth, trend: 'up' };
  if (delta < 0) return { growth, trend: 'down' };
  return { growth: 0, trend: 'neutral' };
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
    { $match: { 'orderSkuList.skuList.merchantProductNo': { $type: 'string', $ne: '' } } },
    {
      $lookup: {
        from: 'products',
        let: { sku: '$orderSkuList.skuList.merchantProductNo' },
        pipeline: [
          { $match: { $expr: { $eq: ['$productSkuCode', '$$sku'] } } },
          { $project: { _id: 0, categoryTrail: 1 } },
          { $limit: 1 },
        ],
        as: 'productMatch',
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$productMatch' }, 0] } } },

    {
      $facet: {
        items: [
          {
            $group: {
              _id: '$orderSkuList.skuList.merchantProductNo',
              product: {
                $first: isCategory
                  ? { $ifNull: [{ $arrayElemAt: ['$productMatch.categoryTrail', 0] }, 'Uncategorized'] }
                  : { $ifNull: ['$orderSkuList.skuList.description', ''] },
              },
              ordered: { $sum: { $toDouble: { $ifNull: ['$orderSkuList.skuList.quantity', 0] } } },
              revenue: { $sum: { $toDouble: { $ifNull: ['$orderSkuList.skuList.lineTotalInclVat', 0] } } },
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

export const prevRevenuePipeline = (sellerObjectId, prevRange, keys = []) => [
  { $match: { sellerId: sellerObjectId, orderDate: { $gte: prevRange.start, $lte: prevRange.end } } },
  { $unwind: '$orderSkuList.skuList' },

  { $match: { 'orderSkuList.skuList.merchantProductNo': { $in: keys } } },

  {
    $lookup: {
      from: 'products',
      let: { sku: '$orderSkuList.skuList.merchantProductNo' },
      pipeline: [{ $match: { $expr: { $eq: ['$productSkuCode', '$$sku'] } } }, { $project: { _id: 0 } }, { $limit: 1 }],
      as: 'productMatch',
    },
  },
  { $match: { $expr: { $gt: [{ $size: '$productMatch' }, 0] } } },

  {
    $group: {
      _id: '$orderSkuList.skuList.merchantProductNo',
      prevRevenue: { $sum: { $toDouble: { $ifNull: ['$orderSkuList.skuList.lineTotalInclVat', 0] } } },
    },
  },
];

export const buildGlobalChannelFilter = (channel) => {
  if (!channel) return {};

  const values = String(channel)
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (!values.length || values.includes('all')) return {};

  const globalNames = values.flatMap((v) => {
    const mapped = CHANNEL_TO_GLOBAL_NAMES[v];
    return mapped;
  });

  return { globalChannelName: { $in: globalNames } };
};

export const pickSelectedGlobalNames = (channel) => {
  if (!channel) return [];
  const filter = buildGlobalChannelFilter(channel);
  const v = filter?.globalChannelName;
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray(v.$in)) return v.$in;
  return [];
};

export default {
  getDateRange,
  getPreviousRange,
  normalizeSeries,
  buildAggregationPipeline,
  buildInventoryStatusPipeline,
  growthWithTrend,
  extractCategoryLabel,
  topFacetPipeline,
  prevRevenuePipeline,
  buildGlobalChannelFilter,
  pickSelectedGlobalNames,
};
