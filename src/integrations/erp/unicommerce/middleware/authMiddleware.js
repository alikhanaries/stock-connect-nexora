import jwt from 'jsonwebtoken';
import User from '#models/User.js';
import { config } from '#config/config.js';
import { failResponse, errorResponse } from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const unicommerceAuthMiddleware = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      failResponse(res, 401, { message: 'Authentication token is required' });
    }
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);

      const user = await User.findById(decoded.id).lean();
      if (!user || user.isDeleted) {
        failResponse(res, 403, { message: 'User unauthorized' });
      }
      req.user = user;
      req.sellerIds = decoded.sellerIds;
      next();
    } catch (error) {
      console.log('JWT verification error:', error.message);
      failResponse(res, 401, { message: 'User unauthorized' });
    }
  } catch (error) {
    console.log('authMiddleware error:', error.message);
    errorResponse(res, 500, { message: 'Server error' });
  }
};
