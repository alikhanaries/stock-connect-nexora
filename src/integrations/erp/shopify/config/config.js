import dotenv from 'dotenv';
dotenv.config();

export const shopifyConfig = {
  BASE_URL: process.env.SHOPIFY_API_URL,
  ACCESS_TOKEN: process.env.SHOPIFY_API_ACCESS_TOKEN,
  SHOPIFY_SHOP_URL: process.env.SHOPIFY_SHOP_URL,
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION,
};
