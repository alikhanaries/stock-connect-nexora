import { getSharedRedisConnection } from '#config/redis.js';
import Responses from '#helpers/response.js';

const WINDOW_MS = 15 * 60 * 1000;

const FORGET_PASSWORD_IP_MAX = 5;
const FORGET_PASSWORD_EMAIL_MAX = 3;

const LOGIN_IP_MAX = 10;
const LOGIN_EMAIL_MAX = 5;

const REFRESH_TOKEN_IP_MAX = 30;

export const LOGIN_FAIL_WINDOW_MS = WINDOW_MS;
export const LOGIN_FAIL_MAX = 5;

const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Please try again later.';
const TOO_MANY_FAILED_LOGINS_MESSAGE = 'Too many failed login attempts. Please try again later.';

export const getClientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

export const normalizeLoginEmail = (email) => (typeof email === 'string' ? email.toLowerCase().trim() : '');

const incrementKey = async (redis, key, windowMs = WINDOW_MS) => {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
const IP_MAX = 5;
const EMAIL_MAX = 3;

const incrementKey = async (redis, key) => {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, WINDOW_MS);
  }
  return count;
};

const runIpEmailRateLimit = async (req, res, { keyPrefix, ipMax, emailMax }) => {
  const redis = getSharedRedisConnection();
  const ip = getClientIp(req);

  const ipKey = `${keyPrefix}:ip:${ip}`;
  const ipCount = await incrementKey(redis, ipKey);
  if (ipCount > ipMax) {
    return Responses.failResponse(res, TOO_MANY_REQUESTS_MESSAGE, 429);
  }

  if (emailMax !== undefined) {
    const email = normalizeLoginEmail(req.body?.email);
    if (email) {
      const emailKey = `${keyPrefix}:email:${email}`;
      const emailCount = await incrementKey(redis, emailKey);
      if (emailCount > emailMax) {
        return Responses.failResponse(res, TOO_MANY_REQUESTS_MESSAGE, 429);
      }
    }
  }

  return null;
};

const createIpEmailRateLimiter =
  ({ keyPrefix, ipMax, emailMax }) =>
  async (req, res, next) => {
    try {
      const blocked = await runIpEmailRateLimit(req, res, { keyPrefix, ipMax, emailMax });
      if (blocked) {
        return blocked;
      }
      next();
    } catch {
      next();
    }
  };

const createIpRateLimiter =
  ({ keyPrefix, ipMax }) =>
  async (req, res, next) => {
    try {
      const blocked = await runIpEmailRateLimit(req, res, { keyPrefix, ipMax, emailMax: undefined });
      if (blocked) {
        return blocked;
      }
      next();
    } catch {
      next();
    }
  };

export const forgetPasswordRateLimiter = createIpEmailRateLimiter({
  keyPrefix: 'auth:forget-password',
  ipMax: FORGET_PASSWORD_IP_MAX,
  emailMax: FORGET_PASSWORD_EMAIL_MAX,
});

export const loginRateLimiter = createIpEmailRateLimiter({
  keyPrefix: 'auth:login',
  ipMax: LOGIN_IP_MAX,
  emailMax: LOGIN_EMAIL_MAX,
});

export const refreshTokenRateLimiter = createIpRateLimiter({
  keyPrefix: 'auth:refresh-token',
  ipMax: REFRESH_TOKEN_IP_MAX,
});

const getLoginFailureKeys = (req) => {
  const ip = getClientIp(req);
  const email = normalizeLoginEmail(req.body?.email);
  const keys = [`auth:login-fail:ip:${ip}`];
  if (email) {
    keys.push(`auth:login-fail:email:${email}`);
  }
  return keys;
};

export const isLoginFailureLockedOut = async (req, res) => {
  try {
    const redis = getSharedRedisConnection();
    const keys = getLoginFailureKeys(req);

    for (const key of keys) {
      const count = await redis.get(key);
      if (count && parseInt(count, 10) >= LOGIN_FAIL_MAX) {
        Responses.failResponse(res, TOO_MANY_FAILED_LOGINS_MESSAGE, 429);
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
};

export const recordLoginFailure = async (req) => {
  try {
    const redis = getSharedRedisConnection();
    const ip = getClientIp(req);
    const email = normalizeLoginEmail(req.body?.email);

    await incrementKey(redis, `auth:login-fail:ip:${ip}`, LOGIN_FAIL_WINDOW_MS);
    if (email) {
      await incrementKey(redis, `auth:login-fail:email:${email}`, LOGIN_FAIL_WINDOW_MS);
    }
  } catch {
    // fail open
  }
};

export const clearLoginFailures = async (req) => {
  try {
    const redis = getSharedRedisConnection();
    const keys = getLoginFailureKeys(req);
    if (keys.length) {
      await redis.del(...keys);
    }
  } catch {
    // fail open
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
