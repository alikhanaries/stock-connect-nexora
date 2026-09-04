import { Queue, QueueEvents } from 'bullmq';
import { createRedisConnection, closeSharedRedisConnection } from '#config/redis.js';
import { config } from '#config/config.js';
import ChannelEngineQueueJob from '#models/ChannelEngineQueueJob.js';
import {
  CE_QUEUE_GROUPS,
  getQueueGroupForOperation,
  CHANNEL_ENGINE_QUEUE_NAME,
} from '#constants/channelEngineQueue.js';

const queues = new Map();
const queueEvents = new Map();

/**
 * Get or create a BullMQ Queue instance for a specific queue group
 */
export function getChannelEngineQueue(queueName = CHANNEL_ENGINE_QUEUE_NAME) {
  if (!queues.has(queueName)) {
    const q = new Queue(queueName, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: config.CE_QUEUE_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: config.CE_QUEUE_JOB_BACKOFF_MS,
        },
        removeOnComplete: { age: 86400, count: 2000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    });
    queues.set(queueName, q);
  }
  return queues.get(queueName);
}

/**
 * Get or create a BullMQ QueueEvents instance for a specific queue group
 */
export function getChannelEngineQueueEvents(queueName = CHANNEL_ENGINE_QUEUE_NAME) {
  if (!queueEvents.has(queueName)) {
    const qe = new QueueEvents(queueName, {
      connection: createRedisConnection(),
    });
    queueEvents.set(queueName, qe);
  }
  return queueEvents.get(queueName);
}

/**
 * Get all available queue instances
 */
export function getAllChannelEngineQueues() {
  return Object.values(CE_QUEUE_GROUPS).map((groupName) => getChannelEngineQueue(groupName));
}

export async function closeChannelEngineQueueConnections() {
  for (const qe of queueEvents.values()) {
    try {
      await qe.close();
    } catch (err) {
      console.error('Error closing QueueEvents:', err.message);
    }
  }
  queueEvents.clear();

  for (const q of queues.values()) {
    try {
      await q.close();
    } catch (err) {
      console.error('Error closing Queue:', err.message);
    }
  }
  queues.clear();

  await closeSharedRedisConnection();
}

function buildFetchLikeResponse(result, trackingId, jobId) {
  return {
    ok: result.ok,
    status: result.status,
    data: result.data,
    rawText: result.rawText,
    trackingId,
    jobId,
    json: async () => result.data,
    text: async () => result.rawText,
  };
}

export async function channelEnginePush({
  operationType,
  method,
  url,
  body,
  headers = {},
  sellerId = null,
  metadata = {},
  batchId = null,
  awaitResult = true,
  timeoutMs = null,
}) {
  const targetQueueName = getQueueGroupForOperation(operationType);
  const maxAttempts = config.CE_QUEUE_JOB_ATTEMPTS;

  const tracking = await ChannelEngineQueueJob.create({
    operationType,
    method,
    url,
    sellerId: sellerId || null,
    status: 'queued',
    requestBody: body ?? null,
    metadata: { ...metadata, queueName: targetQueueName },
    batchId,
    maxAttempts,
  });

  const queue = getChannelEngineQueue(targetQueueName);
  const job = await queue.add(
    operationType,
    {
      trackingId: tracking._id.toString(),
      operationType,
      queueName: targetQueueName,
      method,
      url,
      body: body ?? null,
      headers,
    },
    { jobId: tracking._id.toString() }
  );

  await ChannelEngineQueueJob.findByIdAndUpdate(tracking._id, { bullJobId: job.id });

  if (!awaitResult) {
    return {
      ok: true,
      status: 202,
      data: { trackingId: tracking._id.toString(), jobId: job.id, status: 'queued', queueName: targetQueueName },
      rawText: '',
      trackingId: tracking._id.toString(),
      jobId: job.id,
      json: async () => ({
        trackingId: tracking._id.toString(),
        jobId: job.id,
        status: 'queued',
        queueName: targetQueueName,
      }),
      text: async () => '',
    };
  }

  const events = getChannelEngineQueueEvents(targetQueueName);
  const waitMs = timeoutMs || config.CE_QUEUE_JOB_TIMEOUT_MS;

  try {
    const result = await job.waitUntilFinished(events, waitMs);
    return buildFetchLikeResponse(result, tracking._id.toString(), job.id);
  } catch (err) {
    const record = await ChannelEngineQueueJob.findById(tracking._id).lean();
    console.error(
      `❌ [ChannelEngine Queue Error] [${targetQueueName}] trackingId: ${tracking._id} | Error:`,
      record?.errorMessage || err.message
    );
    if (record?.responseBody || record?.errorDetails) {
      console.error(`   Details:`, JSON.stringify(record.errorDetails || record.responseBody, null, 2));
    }
    const failedResult = {
      ok: false,
      status: record?.httpStatus || 500,
      data: record?.errorDetails || record?.responseBody || null,
      rawText: record?.rawResponse || '',
      errorMessage: record?.errorMessage || err.message,
    };
    return buildFetchLikeResponse(failedResult, tracking._id.toString(), job.id);
  }
}

export async function channelEnginePushRaw(options) {
  const response = await channelEnginePush(options);
  if (!response.ok && options.awaitResult !== false) {
    const err = new Error(
      (typeof response.data === 'object' && response.data?.Message) ||
        response.rawText ||
        `Channel Engine push failed with status ${response.status}`
    );
    err.response = response;
    throw err;
  }
  return response;
}
