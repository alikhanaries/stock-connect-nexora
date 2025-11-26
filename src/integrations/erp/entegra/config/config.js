import dotenv from 'dotenv';
dotenv.config();

export const entegraConfig = {
  ENTEGRA_BASE_URL: process.env.ENTEGRA_BASE_URL,
  ENTEGRA_AUTH_TOKEN: process?.env?.ENTEGRA_AUTH_TOKEN,
};
