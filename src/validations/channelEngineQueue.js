import { z } from 'zod';
import { validate } from './validate.js';
import { CE_QUEUE_OPERATIONS, CE_QUEUE_STATUSES } from '#constants/channelEngineQueue.js';

const queueQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(CE_QUEUE_STATUSES).optional(),
  operationType: z.enum(Object.values(CE_QUEUE_OPERATIONS)).optional(),
  batchId: z.string().trim().optional(),
  sellerId: z.string().trim().optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
});

export const listQueueJobsValidator = validate(async (req) => {
  await queueQuerySchema.parseAsync(req.query);
});

export const queueStatsValidator = validate(async (req) => {
  await queueQuerySchema.pick({ sellerId: true }).parseAsync(req.query);
});

export const listFailedQueueJobsValidator = listQueueJobsValidator;
