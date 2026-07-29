import response from '#helpers/response.js';
import {
  getQueueJobs,
  getQueueJobById,
  getQueueJobByBullId,
  getQueueStats,
  getFailedJobs,
} from '#service/channelEngineQueueService.js';
import { USER_ROLES } from '#constants/common.js';
import mongoose from 'mongoose';

const resolveSellerFilter = (req) => {
  if (req.user?.role === USER_ROLES.MASTER_ADMIN) {
    return req.query.sellerId || null;
  }
  return req.sellerId?.toString() || req.query.sellerId || null;
};

export const listQueueJobs = async (req, res) => {
  try {
    const sellerFilter = resolveSellerFilter(req);
    if (req.user?.role !== USER_ROLES.MASTER_ADMIN && !sellerFilter) {
      return response.failResponse(res, 'Seller ID is required', 400);
    }
    const data = await getQueueJobs(req.query, sellerFilter);
    return response.successResponse(res, 'Queue jobs fetched successfully', 200, data);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const getQueueJob = async (req, res) => {
  try {
    const job = await getQueueJobById(req.params.id);
    if (!job) {
      return response.failResponse(res, 'Queue job not found', 404);
    }
    if (req.user?.role !== USER_ROLES.MASTER_ADMIN && req.sellerIds) {
      const allowed = req.sellerIds.map(String);
      if (job.sellerId && !allowed.includes(job.sellerId.toString())) {
        return response.failResponse(res, 'You do not have access to this queue job', 403);
      }
    }
    return response.successResponse(res, 'Queue job fetched successfully', 200, job);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const getQueueJobByJobId = async (req, res) => {
  try {
    const job = await getQueueJobByBullId(req.params.jobId);
    if (!job) {
      return response.failResponse(res, 'Queue job not found', 404);
    }
    if (req.user?.role !== USER_ROLES.MASTER_ADMIN && req.sellerIds) {
      const allowed = req.sellerIds.map(String);
      if (job.sellerId && !allowed.includes(job.sellerId.toString())) {
        return response.failResponse(res, 'You do not have access to this queue job', 403);
      }
    }
    return response.successResponse(res, 'Queue job fetched successfully', 200, job);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const queueStats = async (req, res) => {
  try {
    const sellerFilter = resolveSellerFilter(req);
    if (req.user?.role !== USER_ROLES.MASTER_ADMIN && !sellerFilter) {
      return response.failResponse(res, 'Seller ID is required', 400);
    }
    const stats = await getQueueStats(sellerFilter);
    return response.successResponse(res, 'Queue stats fetched successfully', 200, stats);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const listFailedQueueJobs = async (req, res) => {
  try {
    const sellerFilter = resolveSellerFilter(req);
    if (req.user?.role !== USER_ROLES.MASTER_ADMIN && !sellerFilter) {
      return response.failResponse(res, 'Seller ID is required', 400);
    }
    const data = await getFailedJobs(req.query, sellerFilter);
    return response.successResponse(res, 'Failed queue jobs fetched successfully', 200, data);
  } catch (error) {
    return response.errorResponse(res, error.message, 500);
  }
};

export const validateObjectIdParam = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return response.failResponse(res, 'Invalid job id', 400);
  }
  next();
};
