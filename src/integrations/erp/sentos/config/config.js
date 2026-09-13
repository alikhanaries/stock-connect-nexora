import dotenv from 'dotenv';

dotenv.config();

export const sentosConfig = {
  SENTOS_API_URL: (process.env.SENTOS_API_URL || '').replace(/\/$/, ''),
  SENTOS_API_KEY: process.env.SENTOS_API_KEY || '',
  SENTOS_API_PASSWORD: process.env.SENTOS_API_PASSWORD || '',
  SENTOS_WAREHOUSE_ID: Number(process.env.SENTOS_WAREHOUSE_ID || 1),
  SENTOS_SELLER_SLUG: process.env.SENTOS_SELLER_SLUG || 'sentos',
  SENTOS_ORDER_CHANNEL_ID: Number(process.env.SENTOS_ORDER_CHANNEL_ID || 1),
};

export const isSentosConfigured = () =>
  Boolean(sentosConfig.SENTOS_API_URL && sentosConfig.SENTOS_API_KEY && sentosConfig.SENTOS_API_PASSWORD);
