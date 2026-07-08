import { Worker, UnrecoverableError } from 'bullmq';
import { createRedisConnection, waitForRedis } from '#config/redis.js';
import { config } from '#config/config.js';
import ChannelEngineQueueJob from '#models/ChannelEngineQueueJob.js';
import { executeChannelEngineRequest } from '#service/channelEngineExecutor.js';
import { CHANNEL_ENGINE_QUEUE_NAME } from '#constants/channelEngineQueue.js';

let workerInstance = null;
let lastWorkerErrorLog = 0;

async function processChannelEngineJob(job) {
  const { trackingId, method, url, body, headers } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? config.CE_QUEUE_JOB_ATTEMPTS;

  await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
    status: attempt > 1 ? 'retrying' : 'active',
    attemptCount: attempt,
    maxAttempts,
    bullJobId: job.id,
  });

  const result = await executeChannelEngineRequest({ method, url, body, headers });

  if (!result.ok) {
    const isLastAttempt = attempt >= maxAttempts;
    await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
      status: isLastAttempt ? 'failed' : 'retrying',
      httpStatus: result.status,
      responseBody: result.data,
      rawResponse: result.rawText,
      errorMessage: result.errorMessage,
      errorDetails: result.data,
      processedAt: isLastAttempt ? new Date() : null,
    });
    const errMsg = result.errorMessage || `Channel Engine push failed (${result.status})`;
    if (result.status >= 400 && result.status < 500) {
      await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
        status: 'failed',
        processedAt: new Date(),
      });
      throw new UnrecoverableError(errMsg);
    }
    throw new Error(errMsg);
  }

  await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
    status: 'completed',
    httpStatus: result.status,
    responseBody: result.data,
    rawResponse: result.rawText,
    errorMessage: null,
    errorDetails: null,
    processedAt: new Date(),
  });

  return result;
}

export async function startChannelEngineWorker() {
  if (workerInstance) {
    return workerInstance;
  }

  await waitForRedis();

  workerInstance = new Worker(CHANNEL_ENGINE_QUEUE_NAME, processChannelEngineJob, {
    connection: createRedisConnection(),
    concurrency: 1,
    limiter: {
      max: config.CE_QUEUE_RATE_LIMIT_MAX,
      duration: config.CE_QUEUE_RATE_LIMIT_DURATION_MS,
    },
  });

  workerInstance.on('failed', async (job, err) => {
    if (!job?.data?.trackingId) return;
    const attempt = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? config.CE_QUEUE_JOB_ATTEMPTS;
    if (attempt >= maxAttempts) {
      await ChannelEngineQueueJob.findByIdAndUpdate(job.data.trackingId, {
        status: 'failed',
        errorMessage: err?.message || 'Job failed',
        processedAt: new Date(),
      });
    }
  });

  workerInstance.on('error', (err) => {
    const now = Date.now();
    if (now - lastWorkerErrorLog > 10000) {
      lastWorkerErrorLog = now;
      console.error('Channel Engine worker error:', err.message);
    }
  });

  console.log('Channel Engine queue worker started');
  return workerInstance;
}

export async function stopChannelEngineWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    console.log('Channel Engine queue worker stopped');
  }
}

const isDirectRun = process.argv[1] && process.argv[1].includes('channelEngineWorker.js');
if (isDirectRun) {
  import('#config/db.js').then((db) =>
    db.default.connect().then(async () => {
      await startChannelEngineWorker();
    })
  );
}
