import jwt from 'jsonwebtoken';
import User from '#models/User.js';
import { config } from '#config/config.js';
import Responses from '#helpers/response.js';

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
      console.timeEnd('authMiddleware');
      req.user = user;
      next();
    } catch (error) {
      console.log('JWT verification error:', error.message);
      return Responses.failResponse(res, 'User unauthorized', 401);
    }
  } catch (error) {
    console.log('authMiddleware error:', error.message);
    return Responses.failResponse(res, 'Server error', 500);
  }
};

export const roleAuthorize = (roles) => {
  return (req, res, next) => {
    try {
      if (req.user.role === 'platform_master') {
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
