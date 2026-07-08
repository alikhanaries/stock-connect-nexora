import Redis from 'ioredis';
import { config } from './config.js';

let sharedConnection = null;

export function createRedisConnection() {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 20) return null;
      return Math.min(times * 500, 5000);
    },
  });
}

export function getSharedRedisConnection() {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export async function waitForRedis(timeoutMs = 30000) {
  const redis = getSharedRedisConnection();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await redis.ping();
      return redis;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Redis unavailable at ${config.REDIS_URL}`);
}

export async function closeSharedRedisConnection() {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
