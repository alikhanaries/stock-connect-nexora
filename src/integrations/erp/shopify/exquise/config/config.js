import dotenv from 'dotenv';
dotenv.config();

export const exquiseShopifyConfig = {
  BASE_URL: process.env.EXQUISE_SHOPIFY_API_URL,
  ACCESS_TOKEN: process.env.EXQUISE_SHOPIFY_API_ACCESS_TOKEN,
  SHOP_URL: process.env.EXQUISE_SHOPIFY_SHOP_URL,
  API_VERSION: process.env.EXQUISE_SHOPIFY_API_VERSION,
};
