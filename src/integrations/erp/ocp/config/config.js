import dotenv from 'dotenv';
dotenv.config();

export const ocpConfig = {
  OCP_URL: process.env.OCP_URL,
  OCP_API_KEY: process.env.OCP_API_KEY,
};

export const ocpEndPoints = {
  OCP_ORDERS: 'api/v1/admin/order',
};
