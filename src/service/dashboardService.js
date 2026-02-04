import mongoose from 'mongoose';
import { ORDER_FLOW_STATUS_CONFIG, SHIPMENT_STATUS } from '#constants/dashboard.js';
import Shipment from '../models/Shipment/Shipment.js';
import Order from '#models/Orders.js';
import Inventory from '#models/Inventory.js';
import {
  getDateRange,
  getPreviousRange,
  buildAggregationPipeline,
  normalizeSeries,
  growthWithTrend,
  extractCategoryLabel,
  topFacetPipeline,
  prevRevenuePipeline,
  buildInventoryStatusPipeline,
  isComparablePeriod,
  buildGlobalChannelFilter,
} from '../helpers/dashboard.js';

const getOrderFlowStatus = async (sellerId, period = null, { startDate, endDate, month, channel } = {}) => {
  try {
    const sellerObjectIds = String(sellerId)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));

    const currentRange = getDateRange({ period, startDate, endDate, month });
    if (!currentRange) throw new Error(`Invalid period "${period}".`);
    const comparable = period !== 'all' && (isComparablePeriod(period) || currentRange.kind === 'custom');

    // Calculate previous range
    const previousRange = comparable ? getPreviousRange(period, currentRange) : currentRange;

    const globalChannelFilter = buildGlobalChannelFilter(channel);
    // Aggregate current & previous
    const [currentAgg, previousAgg] = await Promise.all(
      [currentRange, previousRange].map((range) =>
        Order.aggregate([
          {
            $match: {
              sellerId: { $in: sellerObjectIds },
              ...globalChannelFilter,
              orderDate: { $gte: range.start, $lte: range.end },
            },
          },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
      )
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
  const sellerObjectIds = String(sellerId)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const currentRange = getDateRange({ period, startDate, endDate, month });
  if (!currentRange) throw new Error(`Invalid period "${period}"`);

  const comparable = period !== 'all' && (isComparablePeriod(period) || currentRange.kind === 'custom');
  const previousRange = comparable ? getPreviousRange(period, currentRange) : currentRange;
  const globalChannelFilter = buildGlobalChannelFilter(channel);
  const baseMatch = {
    sellerId: { $in: sellerObjectIds },
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
          totalOrderValue: { $first: '$totalInclVat' },
          deliveredTotal: {
            $sum: {
              $cond: [{ $eq: ['$status', 'DELIVERED'] }, { $ifNull: ['$orderSkuList.skuList.lineTotalInclVat', 0] }, 0],
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
          avgProductsPerOrder: { $avg: '$totalProducts' },
        },
      },
    ]);

    return (
      data ?? {
        totalOrders: 0,
        totalDeliveredSales: 0,
        totalOrderValue: 0,
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

  return [
    buildMetric('totalSales', 'Total Sales', current.totalDeliveredSales, previous.totalDeliveredSales),
    buildMetric('orders', 'Orders', current.totalOrders, previous.totalOrders),
    buildMetric('avgOrderValue', 'Avg Order Value', currAvgOrderValue, prevAvgOrderValue),
    buildMetric(
      'avgProductsPerOrder',
      'Avg Products per Order',
      Math.round(current.avgProductsPerOrder),
      Math.round(previous.avgProductsPerOrder)
    ),
  ];
};

const getShipmentAnalytics = async (sellerId, period) => {
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const range = getDateRange(period);
  const pipeline = [
    {
      $match: {
        sellerId: sellerObjectId,
        updatedAt: { $gte: range.start, $lte: range.end },
        status: { $in: SHIPMENT_STATUS.map((s) => s.key) },
      },
    },
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
  const sellerObjectIds = String(sellerId)
    .split(',')
    .map((s) => s.trim())
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

export const getTopPerformersProducts = async (sellerId, period, type) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }
  const range = getDateRange(period);
  if (!range) throw new Error(`Invalid period "${period}"`);

  const prevRange = getPreviousRange(period, range);
  if (!prevRange?.start || !prevRange?.end) throw new Error(`Invalid period "${period}"`);

  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const [agg] = await Order.aggregate(topFacetPipeline(sellerObjectId, range, type));
  const top = Array.isArray(agg?.items) ? agg.items : [];
  const total = agg?.meta?.[0]?.total ?? 0;

  if (!top.length) return { type, items: [], meta: { shown: 0, total: 0 } };

  const items = [];
  const keys = [];

  for (let i = 0; i < top.length; i++) {
    const x = top[i];
    const key = x?._id;
    if (!key) continue;

    keys.push(key);
    items.push({
      rank: items.length + 1,
      description: type === 'category' ? extractCategoryLabel(x?.product) : x?.product || '',
      ordered: Number(x?.ordered) || 0,
      revenue: Number(x?.revenue) || 0,
      growth: 0,
      trend: 'neutral',
      _key: key,
    });
  }

  if (!keys.length) return { type, items: [], meta: { shown: 0, total: 0 } };

  const prevAgg = await Order.aggregate(prevRevenuePipeline(sellerObjectId, prevRange, keys));
  const prevMap = new Map((Array.isArray(prevAgg) ? prevAgg : []).map((r) => [String(r._id), +r?.prevRevenue || 0]));

  for (const item of items) {
    const prev = prevMap.get(String(item._key)) || 0;
    const { growth, trend } = growthWithTrend(item.revenue, prev);
    item.growth = growth;
    item.trend = trend;
    delete item._key;
  }

  return {
    type,
    items,
    meta: { shown: items.length, total: +total || 0 },
  };
};

const getInventoryStatus = async (sellerId, period) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const range = period ? getDateRange(period) : null;

  if (period && !range) {
    throw new Error(`Invalid period "${period}"`);
  }

  const pipeline = buildInventoryStatusPipeline(sellerObjectId, range);
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    throw new Error('Invalid aggregation pipeline');
  }
  const result = await Inventory.aggregate(pipeline).allowDiskUse(true);
  const agg = result?.[0] ?? {};

  const statusCounts = Array.isArray(agg?.statusCounts) ? agg.statusCounts : [];
  const freezeCounts = Array.isArray(agg?.freezeCounts) ? agg.freezeCounts : [];
  const statusMap = new Map(statusCounts.map((r) => [r.status, r.count]));
  const freezeMap = new Map(freezeCounts.map((r) => [r.status, r.count]));

  const activeCount = statusMap.get('active') ?? 0;
  const total = agg?.totalCount?.[0]?.count ?? 0;
  const activePercentage = total === 0 ? 0 : Number(((activeCount / total) * 100).toFixed(1));

  return {
    total,
    activePercentage,
    breakdown: [
      { status: 'active', count: statusMap.get('active') ?? 0 },
      { status: 'inactive', count: statusMap.get('inactive') ?? 0 },
      { status: 'other', count: statusMap.get('other') ?? 0 },
      { status: 'unfreeze', count: freezeMap.get('unfreeze') ?? 0 },
      { status: 'freeze', count: freezeMap.get('freeze') ?? 0 },
    ],
  };
};

const getSalesByChannel = async (sellerId, period) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }

  const range = getDateRange(period);
  if (!range?.start || !range?.end) {
    throw new Error(`Invalid period "${period}"`);
  }
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const data = await Order.aggregate([
    {
      $match: {
        sellerId: sellerObjectId,
        orderDate: { $gte: range.start, $lte: range.end },
        channelName: { $type: 'string', $ne: '' },
        totalInclVat: { $type: 'number' },
      },
    },
    {
      $group: {
        _id: '$channelName',
        value: {
          $sum: {
            $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$totalInclVat', 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        key: '$_id',
        value: { $round: ['$value', 2] },
      },
    },
    { $sort: { value: -1 } },
  ]).allowDiskUse(true);

  return Array.isArray(data) ? data : [];
};

export default {
  getOrderFlowStatus,
  getorderOverviewStatus,
  getAnalyticsTimeSeries,
  getShipmentAnalytics,
  getTopPerformersProducts,
  getInventoryStatus,
  getSalesByChannel,
};
