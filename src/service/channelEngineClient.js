import { Queue, QueueEvents } from 'bullmq';
import { createRedisConnection, closeSharedRedisConnection } from '#config/redis.js';
import { config } from '#config/config.js';
import ChannelEngineQueueJob from '#models/ChannelEngineQueueJob.js';
import { CHANNEL_ENGINE_QUEUE_NAME } from '#constants/channelEngineQueue.js';

let queueInstance = null;
let queueEventsInstance = null;

export function getChannelEngineQueue() {
  if (!queueInstance) {
    queueInstance = new Queue(CHANNEL_ENGINE_QUEUE_NAME, {
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
  }
  return queueInstance;
}

export function getChannelEngineQueueEvents() {
  if (!queueEventsInstance) {
    queueEventsInstance = new QueueEvents(CHANNEL_ENGINE_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return queueEventsInstance;
}

export async function closeChannelEngineQueueConnections() {
  if (queueEventsInstance) {
    await queueEventsInstance.close();
    queueEventsInstance = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
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
  const maxAttempts = config.CE_QUEUE_JOB_ATTEMPTS;
  const tracking = await ChannelEngineQueueJob.create({
    operationType,
    method,
    url,
    sellerId: sellerId || null,
    status: 'queued',
    requestBody: body ?? null,
    metadata,
    batchId,
    maxAttempts,
  });

  const queue = getChannelEngineQueue();
  const job = await queue.add(
    operationType,
    {
      trackingId: tracking._id.toString(),
      operationType,
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
      data: { trackingId: tracking._id.toString(), jobId: job.id, status: 'queued' },
      rawText: '',
      trackingId: tracking._id.toString(),
      jobId: job.id,
      json: async () => ({ trackingId: tracking._id.toString(), jobId: job.id, status: 'queued' }),
      text: async () => '',
    };
  }

  const events = getChannelEngineQueueEvents();
  const waitMs = timeoutMs || config.CE_QUEUE_JOB_TIMEOUT_MS;

  try {
    const result = await job.waitUntilFinished(events, waitMs);
    return buildFetchLikeResponse(result, tracking._id.toString(), job.id);
  } catch (err) {
    const record = await ChannelEngineQueueJob.findById(tracking._id).lean();
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
