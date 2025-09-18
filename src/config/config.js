import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: process.env.PORT || 3000,
  DB_URL: process.env.DB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CHANNEL_ENGINE_URL: process.env.CHANNEL_ENGINE_URL,
  CHANNEL_ENGINE_BASE_URL: process.env.CHANNEL_ENGINE_BASE_URL,
  CHANNEL_ENGINE_KEY: process.env.CHANNEL_ENGINE_KEY,
  CHANNEL_ENGINE_BATCH_SIZE: process.env.CHANNEL_ENGINE_BATCH_SIZE,
  CHANNEL_ENGINE_MAX_CONCURRENT: process.env.CHANNEL_ENGINE_MAX_CONCURRENT,
  CHANNEL_ORDER_URL: `https://${process.env.CHANNEL_ENGINE}.channelengine.net/api/v2/orders?apikey=${process.env.CHANNEL_ENGINE_API_KEY}`,

  MAIL_HOST: process.env.MAIL_HOST,
  MAIL_PORT: process.env.MAIL_PORT,
  MAIL_USER: process.env.MAIL_USER,
  MAIL_PASS: process.env.MAIL_PASS,
  FROM_ADDRESS: process.env.FROM_ADDRESS,
};
