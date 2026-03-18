import dotenv from 'dotenv';
dotenv.config();

export const uniCommerceConfig = {
  BASE_URL: process.env.UNICOMMERCE_API_URL,
  UNICOMERCE_API_VERSION: process.env.UNICOMERCE_API_VERSION,
};
