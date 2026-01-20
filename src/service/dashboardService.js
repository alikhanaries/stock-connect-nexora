import mongoose from 'mongoose';
import { ORDER_FLOW_STATUS_CONFIG, SHIPMENT_STATUS } from '#constants/dashboard.js';
import Shipment from '../models/Shipment/Shipment.js';
import Order from '#models/Orders.js';
import { getDateRange, getPreviousRange } from '../helpers/dashboard.js';

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

export default { getOrderFlowStatus, getorderOverviewStatus, getShipmentAnalytics };
