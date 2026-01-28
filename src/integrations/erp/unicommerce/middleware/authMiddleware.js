import jwt from 'jsonwebtoken';
import User from '#models/User.js';
import { config } from '#config/config.js';

export const unicommerceAuthMiddleware = async (req, res, next) => {
  console.time('authMiddleware');
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).send({ message: 'Authentication token is required' });
    }
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);

      const user = await User.findById(decoded.id).lean();
      if (!user || user.isDeleted) {
        return res.status(403).send({ message: 'User unauthorized' });
      }
      console.timeEnd('authMiddleware');
      req.user = user;
      req.sellerIds = decoded.sellerIds;
      next();
    } catch (error) {
      console.log('JWT verification error:', error.message);
      return res.status(401).send({ message: 'User unauthorized' });
    }
  } catch (error) {
    console.log('authMiddleware error:', error.message);
    return res.status(500).send({ message: 'Server error' });
  }
};
