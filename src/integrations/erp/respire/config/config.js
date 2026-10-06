import dotenv from 'dotenv';
dotenv.config();

export const respireConfig = {
  RESPIRE_BASE_URL: process.env.RESPIRE_BASE_URL,
  RESPIRE_EMAIL: process.env.RESPIRE_EMAIL,
  RESPIRE_PASSWORD: process.env.RESPIRE_PASSWORD,
  RESPIRE_SELLER_SLUG: process.env.RESPIRE_SELLER_SLUG || 'respire',
};

export const isRespireConfigured = () =>
  Boolean(respireConfig.RESPIRE_BASE_URL && respireConfig.RESPIRE_EMAIL && respireConfig.RESPIRE_PASSWORD);
