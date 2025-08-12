import jwt from 'jsonwebtoken';
import { config } from '#config/config.js';

export const generateToken = (payload, expiresIn = '6h') => {
  const token = jwt.sign(payload, config.JWT_SECRET, { expiresIn });
  return token;
};

export const generateTokenResponse = (user, role) => {
  try {
    const { _id, email, firstName, lastName, isSupplierConnected } = user;
    const payload = { id: _id, email, firstName, lastName, role, isSupplierConnected };

    const token = generateToken(payload);
    const refreshToken = generateToken({ id: _id, type: 'refresh' }, '24h');
    const tokenExpiryTime = Date.now() + 1000 * 60 * 60 * 6;
    const refreshTokenExpiryTime = Date.now() + 1000 * 60 * 60 * 24;

    const tokenResponse = {
      success: true,
      token,
      tokenExpiryTime,
      refreshTokenExpiryTime,
      refreshToken,
      ...payload,
    };

    return tokenResponse;
  } catch (error) {
    return error && false;
  }
};

export const decodeToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    return decoded;
  } catch (error) {
    return error && false;
  }
};
