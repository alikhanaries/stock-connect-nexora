import mongoose from 'mongoose';
import ChannelEngineQueueJob from '#models/ChannelEngineQueueJob.js';
import { getChannelEngineQueue } from '#service/channelEngineClient.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import { CE_QUEUE_STATUSES } from '#constants/channelEngineQueue.js';

export const getQueueJobs = async (query, sellerIdFilter = null) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.size) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  if (sellerIdFilter) {
    filter.sellerId = new mongoose.Types.ObjectId(sellerIdFilter);
  }

  if (query.status && CE_QUEUE_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }

  if (query.operationType) {
    filter.operationType = query.operationType;
  }

  if (query.batchId) {
    filter.batchId = query.batchId;
  }

  if (query.fromDate || query.toDate) {
    filter.createdAt = {};
    if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
    if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
  }

  const [totalElements, jobs] = await Promise.all([
    ChannelEngineQueueJob.countDocuments(filter),
    ChannelEngineQueueJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  return {
    content: jobs,
    pagination: getPagination(totalElements, page, limit),
  };
};

export const getQueueJobById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return ChannelEngineQueueJob.findById(id).lean();
};

export const getQueueJobByBullId = async (bullJobId) => {
  return ChannelEngineQueueJob.findOne({ bullJobId }).lean();
};

export const getQueueStats = async (sellerIdFilter = null) => {
  const match = {};
  if (sellerIdFilter) {
    match.sellerId = new mongoose.Types.ObjectId(sellerIdFilter);
  }

  const statusAgg = await ChannelEngineQueueJob.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const operationAgg = await ChannelEngineQueueJob.aggregate([
    { $match: match },
    { $group: { _id: '$operationType', count: { $sum: 1 } } },
  ]);

  const queue = getChannelEngineQueue();
  const liveCounts = await queue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'completed',
    'failed',
    'prioritized',
    'waiting-children'
  );

  const statusMap = {};
  statusAgg.forEach((row) => {
    statusMap[row._id] = row.count;
  });

  const operationMap = {};
  operationAgg.forEach((row) => {
    operationMap[row._id] = row.count;
  });

  return {
    persisted: statusMap,
    byOperation: operationMap,
    liveQueue: liveCounts,
    rateLimit: {
      maxRequests: Number(process.env.CE_QUEUE_RATE_LIMIT_MAX || 15),
      windowMinutes: Number(process.env.CE_QUEUE_RATE_LIMIT_WINDOW_MINUTES || 15),
    },
  };
};

export const getFailedJobs = async (query, sellerIdFilter = null) => {
  return getQueueJobs({ ...query, status: 'failed' }, sellerIdFilter);
};
