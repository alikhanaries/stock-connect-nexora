import dotenv from 'dotenv';
dotenv.config();

export const entegraConfig = {
  ENTEGRA_BASE_URL: process.env.ENTEGRA_BASE_URL,
  ENTEGRA_AUTH_TOKEN: process?.env?.ENTEGRA_AUTH_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ENTEGRA_EMAIL: process.env.ENTEGRA_EMAIL,
  ENTEGRA_PASSWORD: process.env.ENTEGRA_PASSWORD,
};
