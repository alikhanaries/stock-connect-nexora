import dotenv from 'dotenv';
dotenv.config();

export const uniCommerceConfig = {
  BASE_URL: process.env.UNICOMMERCE_API_URL,
  UNICOMERCE_API_VERSION: process.env.UNICOMERCE_API_VERSION,
  GENERIC_PROXY_URL: process.env.UNICOMMERCE_GENERIC_PROXY_URL || 'https://genericproxy.unicommerce.com',
  CLIENT_ID: process.env.UNICOMMERCE_CLIENT_ID,
  MERCHANT_ID: process.env.UNICOMMERCE_MERCHANT_ID,
  SECURITY_KEY: process.env.UNICOMMERCE_SECURITY_KEY,
  CANCEL_ENDPOINT: '/uc/v1/order/cancel',
  RETURNS_ENDPOINT: '/uc/v1/returns',
};
