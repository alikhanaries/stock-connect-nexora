import mongoose from 'mongoose';
import ApiCallLog from '#models/ApiCallLog.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const SORTABLE_FIELDS = new Set(['createdAt', 'durationMs', 'statusCode', 'method', 'path']);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildApiCallLogFilter = (query = {}) => {
  const filter = {};

  if (query.fromDate || query.toDate) {
    filter.createdAt = {};
    if (query.fromDate) {
      filter.createdAt.$gte = new Date(query.fromDate);
    }
    if (query.toDate) {
      const toDate = new Date(query.toDate);
      toDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = toDate;
    }
  }

  if (query.method) {
    filter.method = query.method.toUpperCase();
  }

  if (query.path) {
    filter.path = { $regex: escapeRegex(query.path.trim()), $options: 'i' };
  }

  if (query.statusCode !== undefined) {
    filter.statusCode = query.statusCode;
  }

  if (query.requestId) {
    filter.requestId = query.requestId.trim();
  }

  if (query.userId) {
    filter.userId = new mongoose.Types.ObjectId(query.userId);
  }

  if (query.sellerId) {
    filter.sellerId = new mongoose.Types.ObjectId(query.sellerId);
  }

  if (query.integration) {
    filter.integration = query.integration.trim();
  }

  if (query.isSlow !== undefined) {
    filter.isSlow = query.isSlow;
  }

  return filter;
};

const buildAppliedFilters = (query = {}) => ({
  fromDate: query.fromDate ?? null,
  toDate: query.toDate ?? null,
  method: query.method ?? null,
  path: query.path ?? null,
  statusCode: query.statusCode ?? null,
  requestId: query.requestId ?? null,
  userId: query.userId ?? null,
  sellerId: query.sellerId ?? null,
  integration: query.integration ?? null,
  isSlow: query.isSlow ?? null,
  sortBy: query.sortBy ?? 'createdAt',
  sortOrder: query.sortOrder ?? 'desc',
});

const resolveSort = (sortBy = 'createdAt', sortOrder = 'desc') => {
  const field = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
  const direction = sortOrder === 'asc' ? 1 : -1;
  return { [field]: direction };
};

const getP95LatencyMs = async (filter) => {
  const totalVolume = await ApiCallLog.countDocuments(filter);
  if (!totalVolume) {
    return 0;
  }

  const p95Index = Math.min(totalVolume - 1, Math.ceil(totalVolume * 0.95) - 1);
  const p95Doc = await ApiCallLog.findOne(filter).sort({ durationMs: 1 }).skip(p95Index).select('durationMs').lean();

  return p95Doc?.durationMs ?? 0;
};

export const listApiCallLogs = async (query = {}) => {
  const page = query.page ?? 1;
  const size = query.size ?? 10;
  const filter = buildApiCallLogFilter(query);
  const sort = resolveSort(query.sortBy, query.sortOrder);

  const totalElements = await ApiCallLog.countDocuments(filter);
  const pagination = getPagination(totalElements, page, size);
  const skip = (pagination.page - 1) * pagination.size;

  const content = await ApiCallLog.find(filter).sort(sort).skip(skip).limit(pagination.size).lean();

  return {
    content,
    appliedFilters: buildAppliedFilters(query),
    ...pagination,
  };
};

export const getApiCallLogByRequestId = async (requestId) => {
  return ApiCallLog.findOne({ requestId }).lean();
};

export const getApiCallLogPerformance = async (query = {}) => {
  const filter = buildApiCallLogFilter(query);

  const [aggregateStats, p95LatencyMs] = await Promise.all([
    ApiCallLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: 1 },
          avgLatencyMs: { $avg: '$durationMs' },
          errorCount: {
            $sum: {
              $cond: [{ $gte: ['$statusCode', 400] }, 1, 0],
            },
          },
          slowRequestCount: {
            $sum: {
              $cond: ['$isSlow', 1, 0],
            },
          },
        },
      },
    ]),
    getP95LatencyMs(filter),
  ]);

  const stats = aggregateStats[0] ?? {
    totalVolume: 0,
    avgLatencyMs: 0,
    errorCount: 0,
    slowRequestCount: 0,
  };

  const totalVolume = stats.totalVolume ?? 0;
  const errorCount = stats.errorCount ?? 0;
  const slowRequestCount = stats.slowRequestCount ?? 0;

  const errorRate = totalVolume > 0 ? Number(((errorCount / totalVolume) * 100).toFixed(2)) : 0;
  const slowRequestRate = totalVolume > 0 ? Number(((slowRequestCount / totalVolume) * 100).toFixed(2)) : 0;

  return {
    totalVolume,
    avgLatencyMs: Math.round(stats.avgLatencyMs ?? 0),
    p95LatencyMs,
    errorCount,
    errorRate,
    slowRequestCount,
    slowRequestRate,
    appliedFilters: buildAppliedFilters(query),
  };
};

export default {
  listApiCallLogs,
  getApiCallLogByRequestId,
  getApiCallLogPerformance,
  buildApiCallLogFilter,
};
