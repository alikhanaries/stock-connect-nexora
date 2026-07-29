import dotenv from 'dotenv';
dotenv.config();

/** Host-only base, e.g. https://api.staging.omniful.com (paths appended in services). */
const resolveOmnifulApiUrl = () => {
  if (process.env.OMNIFUL_API_URL) {
    return process.env.OMNIFUL_API_URL.replace(/\/$/, '');
  }
  const legacyBase = (process.env.OMNIFUL_BASE_URL || '').replace(/\/$/, '');
  if (!legacyBase) return undefined;
  return legacyBase.replace(/\/sales-channel\/public\/v\d+$/, '');
};

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DB_URL: process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  ACCESS_KEY: process.env.ACCESS_KEY,
  SECRET_KEY: process.env.SECRET_KEY,
  ENDPOINT: process.env.ENDPOINT,
  BUCKET_NAME: process.env.BUCKET_NAME,
  INVOICE_BUCKET: process.env.BUCKET_NAME_INVOICE,
  REGION: process.env.REGION,
  CHANNEL_ENGINE_API_KEY: process.env.CHANNEL_ENGINE_API_KEY,
  CHANNEL_ENGINE_BASE_URL: process.env.CHANNEL_ENGINE_BASE_URL,
  CHANNEL_ENGINE_BATCH_SIZE: process.env.CHANNEL_ENGINE_BATCH_SIZE,
  CHANNEL_ENGINE_MAX_CONCURRENT: process.env.CHANNEL_ENGINE_MAX_CONCURRENT,
  MAIL_HOST: process.env.MAIL_HOST,
  MAIL_PORT: process.env.MAIL_PORT,
  MAIL_USER: process.env.MAIL_USER,
  MAIL_PASS: process.env.MAIL_PASS,
  FROM_ADDRESS: process.env.FROM_ADDRESS,
  LOGO_URL: process.env.LOGO_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
  AYMAKAN_API_URL: process.env.AYMAKAN_API_URL,
  AYMAKAN_API_KEY: process.env.AYMAKAN_API_KEY,
  AYMAKAN_API_PROD_KEY: process.env.AYMAKAN_API_PROD_KEY,
  AYMAKAN_API_PROD_URL: process.env.AYMAKAN_API_PROD_URL,
  AYMAKAN_WEBHOOK_SECRET: process.env.AYMAKAN_WEBHOOK_SECRET,
  AYMAKAN_WEBHOOK_HEADER: process.env.AYMAKAN_WEBHOOK_HEADER,
  OCP_URL: process.env.OCP_URL,
  OCP_API_KEY: process.env.OCP_API_KEY,
  BASE_URL: process.env.BASE_URL,
  GEMINI_PROVIDER: process.env.GEMINI_PROVIDER || 'gemini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
  IS_OCP_ORDER_SYNC_ENABLED: process.env.OCP_ORDER_SYNC_FEATURE === 'true',
  OMNIFUL_API_URL: resolveOmnifulApiUrl(),
  OMNIFUL_HUB_CODE: process.env.OMNIFUL_HUB_CODE,
  OMNIFUL_CLIENT_ID: process.env.OMNIFUL_CLIENT_ID,
  OMNIFUL_CLIENT_SECRET: process.env.OMNIFUL_CLIENT_SECRET,
  AYMAKAN_DELIVERY_NAME: process.env.AYMAKAN_DELIVERY_NAME,
  AYMAKAN_DELIVERY_EMAIL: process.env.AYMAKAN_DELIVERY_EMAIL,
  AYMAKAN_DELIVERY_CITY: process.env.AYMAKAN_DELIVERY_CITY,
  AYMAKAN_DELIVERY_ADDRESS: process.env.AYMAKAN_DELIVERY_ADDRESS,
  AYMAKAN_DELIVERY_COUNTRY: process.env.AYMAKAN_DELIVERY_COUNTRY,
  AYMAKAN_DELIVERY_PHONE: process.env.AYMAKAN_DELIVERY_PHONE,
  AYMAKAN_DELIVERY_POSTCODE: process.env.AYMAKAN_DELIVERY_POSTCODE,
  EXPRESS_WAREHOUSE_PRODUCTS_SHEET: process.env.EXPRESS_WAREHOUSE_PRODUCTS_SHEET,
  AYMAKAN_DELIVERY_SHORT_CODE: process.env.AYMAKAN_DELIVERY_SHORT_CODE,
  AYMAKAN_DELIVERY_LAT: process.env.AYMAKAN_DELIVERY_LAT,
  AYMAKAN_DELIVERY_LONG: process.env.AYMAKAN_DELIVERY_LONG,
  CHANNEL_CATEGORIES_CSV: process.env.CHANNEL_CATEGORIES_CSV,
  STOCK_LOCATION: process.env.STOCK_LOCATION,
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  CE_QUEUE_RATE_LIMIT_MAX: parseInt(process.env.CE_QUEUE_RATE_LIMIT_MAX || '15', 10),
  CE_QUEUE_RATE_LIMIT_DURATION_MS: parseInt(process.env.CE_QUEUE_RATE_LIMIT_WINDOW_MINUTES || '15', 10) * 60 * 1000,
  CE_QUEUE_JOB_ATTEMPTS: parseInt(process.env.CE_QUEUE_JOB_ATTEMPTS || '3', 10),
  CE_QUEUE_JOB_BACKOFF_MS: parseInt(process.env.CE_QUEUE_JOB_BACKOFF_MS || '5000', 10),
  CE_QUEUE_JOB_TIMEOUT_MS: parseInt(process.env.CE_QUEUE_JOB_TIMEOUT_MS || '900000', 10),
};
