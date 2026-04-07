import dotenv from 'dotenv';
dotenv.config();

export const catchShopifyConfig = {
  BASE_URL: process.env.CATCH_SHOPIFY_API_URL,
  ACCESS_TOKEN: process.env.CATCH_SHOPIFY_API_ACCESS_TOKEN,
  SHOP_URL: process.env.CATCH_SHOPIFY_SHOP_URL,
  API_VERSION: process.env.CATCH_SHOPIFY_API_VERSION,
};
