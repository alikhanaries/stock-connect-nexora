import mongoose from 'mongoose';
import { ORDER_FLOW_STATUS_CONFIG } from '#constants/common.js';
import Order from '#models/Orders.js';
import { getDateRange } from '../helpers/Order.js';

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
    const previousRange = (() => {
      const { start } = currentRange;
      switch (period) {
        case 'today': {
          const y = new Date(start);
          y.setDate(y.getDate() - 1);
          return {
            start: new Date(y.getFullYear(), y.getMonth(), y.getDate()),
            end: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
          };
        }
        case 'weekly':
          return {
            start: new Date(start.getTime() - 7 * 86400000),
            end: new Date(start.getTime() - 1),
          };
        case 'monthly':
          return {
            start: new Date(start.getFullYear(), start.getMonth() - 1, 1),
            end: new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999),
          };
      }
    })();

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

export default { getOrderFlowStatus };
