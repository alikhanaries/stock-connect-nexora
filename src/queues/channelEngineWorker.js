import { Worker, UnrecoverableError } from 'bullmq';
import { createRedisConnection, waitForRedis } from '#config/redis.js';
import { config } from '#config/config.js';
import ChannelEngineQueueJob from '#models/ChannelEngineQueueJob.js';
import { executeChannelEngineRequest } from '#service/channelEngineExecutor.js';
import { CE_QUEUE_GROUPS } from '#constants/channelEngineQueue.js';

let workerInstances = [];
const workersByQueue = new Map();
let lastWorkerErrorLog = 0;

async function processChannelEngineJob(job) {
  const { trackingId, method, url, body, headers, queueName } = job.data;
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

    // Handle 429 Rate Limit from ChannelEngine
    if (result.status === 429) {
      const waitMs = (result.retryAfter || 60) * 1000;
      const targetQueue = queueName || job.queueName;
      const worker = workersByQueue.get(targetQueue);

      if (worker && typeof worker.rateLimit === 'function') {
        try {
          await worker.rateLimit(waitMs);
          console.warn(`⏳ [Rate Limit 429] Paused worker for queue [${targetQueue}] for ${waitMs / 1000}s`);
        } catch (e) {
          console.warn(`[Rate Limit 429] Could not rateLimit worker:`, e.message);
        }
      }

      await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
        status: isLastAttempt ? 'failed' : 'retrying',
        httpStatus: 429,
        responseBody: result.data,
        rawResponse: result.rawText,
        errorMessage: result.errorMessage || `Channel Engine rate limit hit (429). Retrying after window resets.`,
        errorDetails: { retryAfter: result.retryAfter, ...result.data },
        processedAt: isLastAttempt ? new Date() : null,
      });

      throw new Error(result.errorMessage || 'ChannelEngine 429 Too Many Requests');
    }

    // Permanent 4xx client errors (400, 401, 403, 404, 422, etc.)
    if (result.status >= 400 && result.status < 500) {
      const clientErrMsg = result.errorMessage || `Channel Engine client error (${result.status})`;
      await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
        status: 'failed',
        httpStatus: result.status,
        responseBody: result.data,
        rawResponse: result.rawText,
        errorMessage: clientErrMsg,
        errorDetails: result.data,
        processedAt: new Date(),
      });
      throw new UnrecoverableError(clientErrMsg);
    }

    // Server errors (5xx) or transient network issues
    await ChannelEngineQueueJob.findByIdAndUpdate(trackingId, {
      status: isLastAttempt ? 'failed' : 'retrying',
      httpStatus: result.status,
      responseBody: result.data,
      rawResponse: result.rawText,
      errorMessage: result.errorMessage,
      errorDetails: result.data,
      processedAt: isLastAttempt ? new Date() : null,
    });

    const errMsg = result.errorMessage || `Channel Engine server error (${result.status})`;
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

function getWorkerConfigurations() {
  return [
    {
      name: 'Products Worker',
      queueName: CE_QUEUE_GROUPS.PRODUCTS,
      max: config.CE_LIMIT_PRODUCTS_MAX,
      duration: config.CE_LIMIT_PRODUCTS_DURATION_MS,
      concurrency: config.CE_LIMIT_PRODUCTS_MAX, // Run up to 15 in parallel
    },
    {
      name: 'Stock Worker',
      queueName: CE_QUEUE_GROUPS.STOCK,
      max: config.CE_LIMIT_STOCK_MAX,
      duration: config.CE_LIMIT_STOCK_DURATION_MS,
      concurrency: config.CE_LIMIT_STOCK_MAX, // Run up to 10 in parallel
    },
    {
      name: 'Price Worker',
      queueName: CE_QUEUE_GROUPS.PRICE,
      max: config.CE_LIMIT_PRICE_MAX,
      duration: config.CE_LIMIT_PRICE_DURATION_MS,
      concurrency: config.CE_LIMIT_PRICE_MAX, // Run up to 10 in parallel
    },
    {
      name: 'Cancellations Worker',
      queueName: CE_QUEUE_GROUPS.CANCELLATIONS,
      max: config.CE_LIMIT_CANCELLATIONS_MAX,
      duration: config.CE_LIMIT_CANCELLATIONS_DURATION_MS,
      concurrency: config.CE_LIMIT_CANCELLATIONS_MAX, // Run up to 25 in parallel
    },
    {
      name: 'Orders & Shipments Worker',
      queueName: CE_QUEUE_GROUPS.ORDERS_SHIPMENTS,
      max: config.CE_LIMIT_ORDERS_SHIPMENTS_MAX,
      duration: config.CE_LIMIT_ORDERS_SHIPMENTS_DURATION_MS,
      concurrency: Math.min(config.CE_LIMIT_ORDERS_SHIPMENTS_MAX, 50), // Run up to 50 in parallel
    },
  ];
}

export async function startChannelEngineWorker() {
  if (workerInstances.length > 0) {
    return workerInstances;
  }

  await waitForRedis();

  const configs = getWorkerConfigurations();

  workerInstances = configs.map((cfg) => {
    const worker = new Worker(cfg.queueName, processChannelEngineJob, {
      connection: createRedisConnection(),
      concurrency: cfg.concurrency || 10,
      limiter: {
        max: cfg.max,
        duration: cfg.duration,
      },
    });

    workersByQueue.set(cfg.queueName, worker);

    worker.on('failed', async (job, err) => {
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

    worker.on('error', (err) => {
      const now = Date.now();
      if (now - lastWorkerErrorLog > 10000) {
        lastWorkerErrorLog = now;
        console.error(`Channel Engine worker [${cfg.queueName}] error:`, err.message);
      }
    });

    console.log(
      `Channel Engine worker started for [${cfg.queueName}] (Concurrency: ${cfg.concurrency} parallel calls, Rate limit: ${cfg.max} req / ${cfg.duration / 60000} min)`
    );
    return worker;
  });

  return workerInstances;
}

export async function stopChannelEngineWorker() {
  if (workerInstances.length > 0) {
    await Promise.all(
      workerInstances.map((worker) => worker.close().catch((e) => console.error('Error closing worker:', e.message)))
    );
    workerInstances = [];
    workersByQueue.clear();
    console.log('All Channel Engine queue workers stopped');
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
