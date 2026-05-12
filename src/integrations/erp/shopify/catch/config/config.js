import dotenv from 'dotenv';
dotenv.config();

export const shopifyCatchConfig = {
  SHOPIFY_CATCH_CLIENT_ID: process.env.SHOPIFY_CATCH_CLIENT_ID,
  SHOPIFY_CATCH_CLIENT_SECRET: process.env.SHOPIFY_CATCH_ACCESS_TOKEN,
};
