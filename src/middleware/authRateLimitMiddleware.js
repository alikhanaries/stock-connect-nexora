import { getSharedRedisConnection } from '#config/redis.js';
import Responses from '#helpers/response.js';

const WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 5;
const EMAIL_MAX = 3;

const incrementKey = async (redis, key) => {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, WINDOW_MS);
  }
  return count;
};

export const forgetPasswordRateLimiter = async (req, res, next) => {
  try {
    const redis = getSharedRedisConnection();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';

    const ipKey = `auth:forget-password:ip:${ip}`;
    const ipCount = await incrementKey(redis, ipKey);
    if (ipCount > IP_MAX) {
      return Responses.failResponse(res, 'Too many requests. Please try again later.', 429);
    }

    if (email) {
      const emailKey = `auth:forget-password:email:${email}`;
      const emailCount = await incrementKey(redis, emailKey);
      if (emailCount > EMAIL_MAX) {
        return Responses.failResponse(res, 'Too many requests. Please try again later.', 429);
      }
    }

    next();
  } catch {
    next();
  }
};
