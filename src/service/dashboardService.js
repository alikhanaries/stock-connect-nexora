import mongoose from 'mongoose';
import { ORDER_FLOW_STATUS_CONFIG, SHIPMENT_STATUS, CHANNEL_STATUS_CONFIG } from '#constants/dashboard.js';
import Shipment from '../models/Shipment/Shipment.js';
import Order from '#models/Orders.js';
import Inventory from '#models/Inventory.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import Return from '../models/Return.js';
import {
  getDateRange,
  getPreviousRange,
  buildAggregationPipeline,
  normalizeSeries,
  growthWithTrend,
  extractCategoryLabel,
  topFacetPipeline,
  prevRevenuePipeline,
  pickChannelIdsFromChannel,
  buildInventoryStatusPipeline,
  isComparablePeriod,
  buildGlobalChannelFilter,
  pickSelectedGlobalNames,
  buildChannelStatusPipeline,
  buildReturnsStatusPipeline,
  formatLabel,
} from '../helpers/dashboard.js';

const getOrderFlowStatus = async (sellerId, period = null, { startDate, endDate, month, channel } = {}) => {
  try {
    const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

    const sellerObjectIds = ids
      .map(String)
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));

    const currentRange = getDateRange({ period, startDate, endDate, month });
    if (!currentRange) throw new Error(`Invalid period "${period}".`);
    const comparable = period !== 'all' && (isComparablePeriod(period) || currentRange.kind === 'custom');

    // Calculate previous range
    const previousRange = comparable ? getPreviousRange(period, currentRange) : currentRange;

    const globalChannelFilter = buildGlobalChannelFilter(channel);
    // Aggregate current & previous
    const buildAgg = (range) => [
      {
        $match: {
          sellerIds: { $in: sellerObjectIds },
          ...globalChannelFilter,
          orderDate: { $gte: range.start, $lte: range.end },
        },
      },
      {
        $facet: {
          statusCounts: [
            { $match: { status: { $ne: 'DELIVERED' } } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          deliveredQty: [
            { $unwind: { path: '$orderSkuList.skuList', preserveNullAndEmptyArrays: false } },
            { $match: { 'orderSkuList.skuList.statusBreakdown.delivered': { $gt: 0 } } },
            {
              $group: {
                _id: 'DELIVERED',
                count: { $sum: { $ifNull: ['$orderSkuList.skuList.statusBreakdown.delivered', 0] } },
              },
            },
          ],
        },
      },
      {
        $project: {
          merged: { $concatArrays: ['$statusCounts', '$deliveredQty'] },
        },
      },
      { $unwind: '$merged' },
      {
        $group: {
          _id: '$merged._id',
          count: { $sum: '$merged.count' },
        },
      },
    ];

    const [currentAgg, previousAgg] = await Promise.all(
      [currentRange, previousRange].map((range) => Order.aggregate(buildAgg(range)))
    );

    const toMap = (arr) => Object.fromEntries(arr.map((s) => [s._id.toUpperCase(), s.count]));
    const [currentStatus, previousStatus] = [toMap(currentAgg), toMap(previousAgg)];

    // Final data mapping
    return ORDER_FLOW_STATUS_CONFIG.map(({ key, label, statuses }) => {
      const currentValue = statuses.reduce((sum, s) => sum + (currentStatus[s.toUpperCase()] || 0), 0);
      if (period === 'all') return { key, label, value: currentValue, changePercent: 100, trend: 'up' };
      if (!comparable) return { key, label, value: currentValue, changePercent: 0, trend: 'neutral' };
      const previousValue = statuses.reduce((sum, s) => sum + (previousStatus[s.toUpperCase()] || 0), 0);

      let changePercent =
        previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : currentValue > 0 ? 100 : 0;
      changePercent = Number(changePercent.toFixed(1));
      const trend = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'neutral';
      const finalChangePercent = trend === 'down' ? Math.abs(changePercent) : changePercent;

      return { key, label, value: currentValue, changePercent: finalChangePercent, trend };
    });
  } catch (err) {
    console.error('Error getting order flow:', err);
    throw err;
  }
};

const getorderOverviewStatus = async (sellerId, period, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const currentRange = getDateRange({ period, startDate, endDate, month });
  if (!currentRange) throw new Error(`Invalid period "${period}"`);

  const comparable = period !== 'all' && (isComparablePeriod(period) || currentRange.kind === 'custom');
  const previousRange = comparable ? getPreviousRange(period, currentRange) : currentRange;
  const globalChannelFilter = buildGlobalChannelFilter(channel);
  const baseMatch = {
    sellerIds: { $in: sellerObjectIds },
    ...globalChannelFilter,
  };

  const aggregateMetrics = async ({ start, end }) => {
    const [data] = await Order.aggregate([
      {
        $match: {
          ...baseMatch,
          orderDate: { $gte: start, $lte: end },
        },
      },
      { $unwind: '$orderSkuList.skuList' },
      {
        $group: {
          _id: '$_id',
          status: { $first: '$status' },
          totalOrderValue: { $first: { $ifNull: ['$originalTotalInclVat', 0] } },
          deliveredTotal: {
            $sum: {
              $multiply: [
                { $ifNull: ['$orderSkuList.skuList.statusBreakdown.delivered', 0] },
                { $ifNull: ['$orderSkuList.skuList.originalUnitPriceInclVat', 0] },
              ],
            },
          },
          canceledTotal: {
            $sum: {
              $multiply: [
                { $ifNull: ['$orderSkuList.skuList.statusBreakdown.canceled', 0] },
                { $ifNull: ['$orderSkuList.skuList.originalUnitPriceInclVat', 0] },
              ],
            },
          },

          totalProducts: {
            $sum: '$orderSkuList.skuList.quantity',
          },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalDeliveredSales: { $sum: '$deliveredTotal' },
          totalOrderValue: { $sum: '$totalOrderValue' },

          cancellationValue: { $sum: '$canceledTotal' },

          avgProductsPerOrder: { $avg: '$totalProducts' },
        },
      },
    ]);

    return (
      data ?? {
        totalOrders: 0,
        totalDeliveredSales: 0,
        totalOrderValue: 0,
        cancellationValue: 0,
        avgProductsPerOrder: 0,
      }
    );
  };

  const [current, previous] = await Promise.all([aggregateMetrics(currentRange), aggregateMetrics(previousRange)]);

  const calcChange = (curr, prev) =>
    prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;

  const buildMetric = (key, label, curr, prev) => {
    const change = calcChange(curr, prev);
    if (period === 'all') {
      return {
        key,
        label,
        value: Number(curr.toFixed(2)),
        changePercent: 100,
        trend: 'up',
      };
    }
    return {
      key,
      label,
      value: Number(curr.toFixed(2)),
      changePercent: Math.abs(change),
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    };
  };

  const currAvgOrderValue = current.totalOrders > 0 ? current.totalOrderValue / current.totalOrders : 0;

  const prevAvgOrderValue = previous.totalOrders > 0 ? previous.totalOrderValue / previous.totalOrders : 0;

  const currNetGmv = current.totalOrderValue - current.cancellationValue;
  const prevNetGmv = previous.totalOrderValue - previous.cancellationValue;

  return [
    buildMetric(
      'totalSales',
      'Total Sales by Product Delivered',
      current.totalDeliveredSales,
      previous.totalDeliveredSales
    ),
    buildMetric(
      'totalRevenue',
      'Total GMV (Gross Merchandise Value)',
      current.totalOrderValue,
      previous.totalOrderValue
    ),
    buildMetric('netGmv', 'Net GMV', currNetGmv, prevNetGmv),
    buildMetric('orders', 'Orders', current.totalOrders, previous.totalOrders),
    buildMetric('avgOrderValue', 'Avg Order Value', currAvgOrderValue, prevAvgOrderValue),
    buildMetric(
      'avgProductsPerOrder',
      'Avg Products per Order',
      current.avgProductsPerOrder,
      previous.avgProductsPerOrder
    ),
  ];
};

const getShipmentAnalytics = async (sellerId, period, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
  const range = period === 'all' ? null : getDateRange({ period, startDate, endDate, month });
  if (period !== 'all' && !range) throw new Error(`Invalid period "${period}"`);

  const globalChannelFilter = buildGlobalChannelFilter(channel);
  const hasChannel =
    Array.isArray(globalChannelFilter?.globalChannelName?.$in) && globalChannelFilter.globalChannelName.$in.length > 0;
  const ordersCollection = Order.collection.name;
  const pipeline = [
    {
      $match: {
        sellerId: { $in: sellerObjectIds },
        status: { $in: SHIPMENT_STATUS.map((s) => s.key) },
        ...(range ? { updatedAt: { $gte: range.start, $lte: range.end } } : {}),
      },
    },

    ...(hasChannel
      ? [
          {
            $lookup: {
              from: ordersCollection,
              localField: 'orderId',
              foreignField: '_id',
              as: 'order',
              pipeline: [{ $project: { _id: 1, globalChannelName: 1 } }],
            },
          },
          { $unwind: '$order' },
          {
            $match: {
              'order.globalChannelName': { $in: globalChannelFilter.globalChannelName.$in },
            },
          },
        ]
      : []),

    {
      $group: {
        _id: '$status',
        value: { $sum: 1 },
      },
    },
  ];
  const raw = await Shipment.aggregate(pipeline);
  const map = new Map(raw.map((r) => [r._id, r.value]));
  return SHIPMENT_STATUS.map((s) => ({
    label: s.label,
    value: map.get(s.key) || 0,
  }));
};

const getAnalyticsTimeSeries = async (sellerId, period, metric, { startDate, endDate, month, channel } = {}) => {
  if (!['sales', 'orders'].includes(metric)) throw new Error(`Invalid metric "${metric}"`);
  const globalChannelFilter = buildGlobalChannelFilter(channel);
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
  const range = getDateRange({ period, startDate, endDate, month });
  if (!range) throw new Error(`Invalid period "${period}"`);

  const pipeline = buildAggregationPipeline({
    sellerObjectIds,
    period,
    metric,
    range,
    ...globalChannelFilter,
  });

  const rawData = await Order.aggregate(pipeline);

  return { metric, data: normalizeSeries(period, rawData, range) };
};

export const getTopPerformersProducts = async (
  sellerId,
  period = null,
  { startDate, endDate, month, channel } = {}
) => {
  const ids = Array.isArray(sellerId) ? sellerId : String(sellerId).split(',');
  const sellerObjectIds = ids
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid sellerId');
      return new mongoose.Types.ObjectId(id);
    });

  const range = getDateRange({ period, startDate, endDate, month });
  if (!range?.start || !range?.end) throw new Error(`Invalid period "${period}"`);

  const comparable = period !== 'all' && (isComparablePeriod(period) || range.kind === 'custom');
  const prevRange = comparable ? getPreviousRange(period, range) : range;

  const globalChannelFilter = buildGlobalChannelFilter(channel);

  const [productData, categoryData] = await Promise.all([
    _getTopPerformersByType('product'),
    _getTopPerformersByType('category'),
  ]);

  return [productData, categoryData];

  async function _getTopPerformersByType(type) {
    const [agg] = await Order.aggregate(topFacetPipeline(sellerObjectIds, range, type, globalChannelFilter));
    const top = Array.isArray(agg?.items) ? agg.items : [];
    const total = agg?.meta?.[0]?.total ?? 0;

    if (!top.length) return { type, items: [], meta: { shown: 0, total: 0 } };

    const items = [];
    const keys = [];

    for (const x of top) {
      const key = x?._id;
      if (!key) continue;

      keys.push(key);
      const item = {
        rank: items.length + 1,
        description: type === 'category' ? extractCategoryLabel(x?.product) : x?.product || '',
        brand: x?.brand || '',
        ordered: Number(x?.ordered) || 0,
        revenue: Number(x?.revenue) || 0,
        growth: 0,
        trend: 'neutral',
        _key: key,
      };

      if (type !== 'category') {
        item.size = x?.size || '';
        item.productSkuCode = x?.productSkuCode || '';
      }

      items.push(item);
    }

    if (!keys.length) return { type, items: [], meta: { shown: 0, total: 0 } };

    if (!comparable) {
      for (const item of items) delete item._key;
      return { type, items, meta: { shown: items.length, total: +total || 0 } };
    }

    const prevAgg = await Order.aggregate(prevRevenuePipeline(sellerObjectIds, prevRange, keys, globalChannelFilter));
    const prevMap = new Map((prevAgg ?? []).map((r) => [String(r._id), +r?.prevRevenue || 0]));

    for (const item of items) {
      const prev = prevMap.get(String(item._key)) || 0;
      const { growth, trend } = growthWithTrend(item.revenue, prev);
      item.growth = growth;
      item.trend = trend;
      delete item._key;
    }

    return { type, items, meta: { shown: items.length, total: +total || 0 } };
  }
};

const getInventoryStatus = async (sellerId, period, { startDate, endDate, month, channel, type } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const range = period === 'all' ? null : getDateRange({ period, startDate, endDate, month });
  if (period !== 'all' && !range) throw new Error(`Invalid period "${period}"`);

  const channelIds = pickChannelIdsFromChannel(channel);
  const pipeline = buildInventoryStatusPipeline(sellerObjectIds, range, channelIds);
  if (!Array.isArray(pipeline) || pipeline.length === 0) throw new Error('Invalid aggregation pipeline');

  const result = await Inventory.aggregate(pipeline).allowDiskUse(true);
  const agg = result?.[0] ?? {};

  const statusCounts = Array.isArray(agg?.statusCounts) ? agg.statusCounts : [];
  const freezeCounts = Array.isArray(agg?.freezeCounts) ? agg.freezeCounts : [];
  const statusMap = new Map(statusCounts.map((r) => [r.status, r.count]));
  const freezeMap = new Map(freezeCounts.map((r) => [r.status, r.count]));

  const total = agg?.totalCount?.[0]?.count ?? 0;
  const activeCount = statusMap.get('active') ?? 0;
  const activePercentage = total === 0 ? 0 : Number(((activeCount / total) * 100).toFixed(1));

  const normalizedType = String(type ?? '').toLowerCase();

  if (normalizedType === 'state') {
    return {
      total,
      breakdown: [
        { key: 'unfreeze', value: freezeMap.get('unfreeze') ?? 0 },
        { key: 'freeze', value: freezeMap.get('freeze') ?? 0 },
      ],
    };
  }

  if (normalizedType === 'status') {
    return {
      total,
      activePercentage,
      breakdown: [
        { key: 'active', value: statusMap.get('active') ?? 0 },
        { key: 'inactive', value: statusMap.get('inactive') ?? 0 },
      ],
    };
  }

  return {
    total,
    activePercentage,
    statusBreakdown: {
      active: statusMap.get('active') ?? 0,
      inactive: statusMap.get('inactive') ?? 0,
    },
    stateBreakdown: {
      unfreeze: freezeMap.get('unfreeze') ?? 0,
      freeze: freezeMap.get('freeze') ?? 0,
    },
  };
};

const getSalesByChannel = async (sellerId, period = null, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const range = getDateRange({ period, startDate, endDate, month });
  if (!range?.start || !range?.end) throw new Error(`Invalid period "${period}".`);
  const selectedNames = pickSelectedGlobalNames(channel);
  const hasChannel = selectedNames.length > 0;

  const pipeline = [
    {
      $match: {
        sellerIds: { $in: sellerObjectIds },
        orderDate: { $gte: range.start, $lte: range.end },
        globalChannelName: { $type: 'string', $ne: '' },
      },
    },
    {
      $unwind: {
        path: '$orderSkuList.skuList',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $group: {
        _id: '$globalChannelName',
        deliveredSales: {
          $sum: {
            $multiply: [
              { $ifNull: ['$orderSkuList.skuList.statusBreakdown.delivered', 0] },
              { $ifNull: ['$orderSkuList.skuList.originalUnitPriceInclVat', 0] },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        key: '$_id',
        value: hasChannel
          ? { $cond: [{ $in: ['$_id', selectedNames] }, { $round: ['$deliveredSales', 2] }, 0] }
          : { $round: ['$deliveredSales', 2] },
      },
    },
    { $sort: { value: -1, key: 1 } },
  ];

  const data = await Order.aggregate(pipeline).allowDiskUse(true);
  const out = Array.isArray(data) ? data : [];
  if (hasChannel) {
    const map = new Map(out.map((r) => [r.key, r.value]));
    for (const name of selectedNames) {
      if (!map.has(name)) out.push({ key: name, value: 0 });
    }
    out.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  }

  return out;
};

const getOrdersByChannel = async (sellerId, period = null, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const range = getDateRange({ period, startDate, endDate, month });
  if (!range?.start || !range?.end) throw new Error(`Invalid period "${period}".`);

  const selectedNames = pickSelectedGlobalNames(channel);
  const hasChannel = selectedNames.length > 0;

  const pipeline = [
    {
      $match: {
        sellerIds: { $in: sellerObjectIds },
        orderDate: { $gte: range.start, $lte: range.end },
        globalChannelName: { $type: 'string', $ne: '' },
      },
    },
    { $group: { _id: '$globalChannelName', count: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        key: '$_id',
        value: hasChannel ? { $cond: [{ $in: ['$_id', selectedNames] }, '$count', 0] } : '$count',
      },
    },
    { $sort: { value: -1, key: 1 } },
  ];

  const data = await Order.aggregate(pipeline).allowDiskUse(true);
  return Array.isArray(data) ? data : [];
};

export const getChannelStatus = async (sellerId, period, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const hasCustomRange = Boolean(startDate || endDate || month);
  const range = period === 'all' ? null : getDateRange({ period, startDate, endDate, month });
  if (period !== 'all') {
    if (!period && !hasCustomRange) {
      throw new Error('Missing period or custom date range.');
    }
    if (!range) {
      throw new Error(`Invalid period "${period}"`);
    }
  }

  const channelIds = pickChannelIdsFromChannel(channel);
  const pipeline = buildChannelStatusPipeline(sellerObjectIds, range, channelIds);

  const result = await UserChannelProducts.aggregate(pipeline).allowDiskUse(true);
  const agg = result?.[0] ?? {};

  const total = agg?.totalCount?.[0]?.count ?? 0;
  const statusCounts = Array.isArray(agg?.statusCounts) ? agg.statusCounts : [];
  const statusMap = new Map(statusCounts.map((r) => [String(r.status).toUpperCase(), r.count]));

  return {
    total,
    breakdown: CHANNEL_STATUS_CONFIG.map(({ label, key }) => ({
      key: label,
      value: statusMap.get(key) ?? 0,
    })),
  };
};

export const getReturnsOverview = async (sellerId, period, { startDate, endDate, month, channel } = {}) => {
  const ids = Array.isArray(sellerId) ? sellerId : [sellerId];

  const sellerObjectIds = ids
    .map(String)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const range = getDateRange({ period, startDate, endDate, month });
  if (!range?.start || !range?.end) throw new Error(`Invalid period "${period}"`);

  const channelIds = pickChannelIdsFromChannel(channel);

  const pipeline = buildReturnsStatusPipeline(sellerObjectIds, range, channelIds);

  const [result] = await Return.aggregate(pipeline);

  const reasons = (result?.reasons ?? []).map((r) => ({
    value: r.value,
    key: r.key ? formatLabel(r.key) : null,
  }));

  const statusSummary = (result?.statusSummary ?? []).map((s) => ({
    value: s.value,
    key: s.key ? formatLabel(s.key) : null,
  }));

  const total = statusSummary.reduce((sum, s) => sum + (s.value || 0), 0);

  return { total, reasons, statusSummary };
};

export default {
  getOrderFlowStatus,
  getorderOverviewStatus,
  getAnalyticsTimeSeries,
  getShipmentAnalytics,
  getTopPerformersProducts,
  getInventoryStatus,
  getSalesByChannel,
  getOrdersByChannel,
  getChannelStatus,
  getReturnsOverview,
};
