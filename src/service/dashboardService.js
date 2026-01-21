import mongoose from 'mongoose';
import { ORDER_FLOW_STATUS_CONFIG, SHIPMENT_STATUS } from '#constants/dashboard.js';
import Shipment from '../models/Shipment/Shipment.js';
import Order from '#models/Orders.js';
import {
  getDateRange,
  getPreviousRange,
  buildAggregationPipeline,
  normalizeSeries,
  growthWithTrend,
  extractCategoryLabel,
  topFacetPipeline,
  prevRevenuePipeline,
} from '../helpers/dashboard.js';

const getOrderFlowStatus = async (sellerId, period = null) => {
  try {
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

    if (!period) {
      const statusAgg = await Order.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const statusMap = Object.fromEntries(statusAgg.map((s) => [s._id.toUpperCase(), s.count]));

      return ORDER_FLOW_STATUS_CONFIG.map(({ key, label, statuses }) => ({
        key,
        label,
        value: statuses.reduce((sum, s) => sum + (statusMap[s.toUpperCase()] || 0), 0),
        changePercent: 0,
        trend: '',
      }));
    }

    const currentRange = getDateRange(period);
    if (!currentRange) throw new Error(`Invalid period "${period}". Allowed: today, weekly, monthly`);

    // Calculate previous range
    const previousRange = getPreviousRange(period, currentRange);

    // Aggregate current & previous
    const [currentAgg, previousAgg] = await Promise.all(
      [currentRange, previousRange].map((range) =>
        Order.aggregate([
          { $match: { sellerId: sellerObjectId, orderDate: { $gte: range.start, $lte: range.end } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
      )
    );

    const toMap = (arr) => Object.fromEntries(arr.map((s) => [s._id.toUpperCase(), s.count]));
    const [currentStatus, previousStatus] = [toMap(currentAgg), toMap(previousAgg)];

    // Final data mapping
    return ORDER_FLOW_STATUS_CONFIG.map(({ key, label, statuses }) => {
      const currentValue = statuses.reduce((sum, s) => sum + (currentStatus[s.toUpperCase()] || 0), 0);
      const previousValue = statuses.reduce((sum, s) => sum + (previousStatus[s.toUpperCase()] || 0), 0);

      let changePercent =
        previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : currentValue > 0 ? 100 : 0;

      changePercent = Number(changePercent.toFixed(1));
      const trend = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : '';
      const finalChangePercent = trend === 'down' ? Math.abs(changePercent) : changePercent;

      return { key, label, value: currentValue, changePercent: finalChangePercent, trend };
    });
  } catch (err) {
    console.error('Error getting order flow:', err);
    throw err;
  }
};

const getorderOverviewStatus = async (sellerId, period) => {
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const currentRange = getDateRange(period);
  if (!currentRange) throw new Error(`Invalid period "${period}"`);

  const previousRange = getPreviousRange(period, currentRange);

  const aggregateMetrics = async ({ start, end }) => {
    const [data] = await Order.aggregate([
      {
        $match: {
          sellerId: sellerObjectId,
          orderDate: { $gte: start, $lte: end },
        },
      },
      { $unwind: '$orderSkuList.skuList' },
      {
        $group: {
          _id: '$_id',
          totalOrderValue: { $first: '$totalInclVat' },
          deliveredTotal: {
            $first: {
              $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$totalInclVat', 0],
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
    return {
      key,
      label,
      value: Number(curr.toFixed(2)),
      changePercent: Math.abs(change),
      trend: change > 0 ? 'up' : change < 0 ? 'down' : '',
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
      current.avgProductsPerOrder,
      previous.avgProductsPerOrder
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

const getAnalyticsTimeSeries = async (sellerId, period, metric) => {
  if (!['sales', 'orders'].includes(metric)) throw new Error(`Invalid metric "${metric}"`);
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
  const range = getDateRange(period);
  if (!range) throw new Error(`Invalid period "${period}"`);

  const pipeline = buildAggregationPipeline({ sellerObjectId, period, metric, range });
  const rawData = await Order.aggregate(pipeline);

  return { metric, data: normalizeSeries(period, rawData, range) };
};

export const getTopPerformersProducts = async (sellerId, period, type) => {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    throw new Error('Invalid sellerId');
  }

  if (!['product', 'category'].includes(type)) {
    throw new Error(`Invalid type "${type}". Allowed: product, category`);
  }

  const range = getDateRange(period);
  if (!range?.start || !range?.end) {
    throw new Error(`Invalid period "${period}"`);
  }

  const prevRange = getPreviousRange(period, range);
  if (!prevRange?.start || !prevRange?.end) {
    throw new Error(`Failed to compute previous range for period "${period}"`);
  }

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
      ordered: +x?.ordered || 0,
      revenue: +x?.revenue || 0,
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

export default {
  getOrderFlowStatus,
  getorderOverviewStatus,
  getAnalyticsTimeSeries,
  getShipmentAnalytics,
  getTopPerformersProducts,
};
