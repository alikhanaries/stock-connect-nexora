import dotenv from 'dotenv';
dotenv.config();

export const config = {
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
};
