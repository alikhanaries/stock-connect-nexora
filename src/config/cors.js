import { config } from './config.js';

export const parseAllowedOrigins = (value = process.env.CORS_ORIGIN) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins();

if (config.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must be set in production');
}

export const corsOptions = {
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
};

export const getAllowedOrigins = () => [...allowedOrigins];
