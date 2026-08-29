import jwt from 'jsonwebtoken';
import User from '#models/User.js';
import { config } from '#config/config.js';
import Responses from '#helpers/response.js';
import { USER_ROLES } from '#constants/common.js';
import crypto from 'crypto';

export const authMiddleware = async (req, res, next) => {
  console.time('authMiddleware');
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return Responses.failResponse(res, 'Authentication token is required', 401);
    }
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);

      const user = await User.findById(decoded.id).lean();
      if (!user || user.isDeleted) {
        return Responses.failResponse(res, 'User unauthorized', 403);
      }

      const userTokenVersion = user.tokenVersion || 0;
      const decodedTokenVersion = decoded.tokenVersion ?? 0;
      if (userTokenVersion !== decodedTokenVersion) {
        return Responses.failResponse(res, 'User unauthorized', 401);
      }

      req.user = user;
      req.sellerIds = decoded.sellerIds;
      next();
    } catch (error) {
      console.log('JWT verification error:', error.message);
      return Responses.failResponse(res, 'User unauthorized', 401);
    }
  } catch (error) {
    console.log('authMiddleware error:', error.message);
    return Responses.failResponse(res, 'Server error', 500);
  } finally {
    console.timeEnd('authMiddleware');
  }
};

export const authorize = (roles) => {
  return (req, res, next) => {
    try {
      if (req.user.role === USER_ROLES.MASTER_ADMIN) {
        return next();
      }
      if (!roles.includes(req.user.role)) {
        return Responses.errorResponse(res, `User role ${req.user.role} is not authorized to access this route`, 403);
      }
      next();
    } catch (error) {
      console.log('authorize middleware error:', error.message);
      return Responses.errorResponse(res, 'Server error', 500);
    }
  };
};

export const createWebhookAuthMiddleware = ({ secret, headerName, secretLabel }) => {
  return async (req, res, next) => {
    console.time('webHookAuthMiddleware');

    try {
      const resolvedHeader = headerName || 'X-Custom-Auth';

      if (!secret) {
        console.error(`${secretLabel} missing in environment`);
        return Responses.failResponse(res, 'Server misconfiguration', 500);
      }

      const receivedToken = req.headers[resolvedHeader.toLowerCase()];
      if (!receivedToken) {
        return Responses.failResponse(res, `Missing ${resolvedHeader} header`, 401);
      }

      const receivedBuffer = Buffer.from(receivedToken);
      const expectedBuffer = Buffer.from(secret);

      if (receivedBuffer.length !== expectedBuffer.length) {
        return Responses.failResponse(res, 'Unauthorized', 403);
      }

      const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

      if (!isValid) {
        return Responses.failResponse(res, 'Unauthorized', 403);
      }

      console.timeEnd('webHookAuthMiddleware');
      next();
    } catch (error) {
      console.error('webHookAuthMiddleware error:', error.message);
      return Responses.failResponse(res, 'Server error', 500);
    }
  };
};

export const webHookAuthMiddleware = createWebhookAuthMiddleware({
  secret: config.AYMAKAN_WEBHOOK_SECRET,
  headerName: config.AYMAKAN_WEBHOOK_HEADER || 'X-Custom-Auth',
  secretLabel: 'AYMAKAN_WEBHOOK_SECRET',
});

export const omnifulWebHookAuthMiddleware = createWebhookAuthMiddleware({
  secret: config.OMNIFUL_WEBHOOK_SECRET,
  headerName: config.OMNIFUL_WEBHOOK_HEADER || 'X-Custom-Auth',
  secretLabel: 'OMNIFUL_WEBHOOK_SECRET',
});
