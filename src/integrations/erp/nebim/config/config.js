import dotenv from 'dotenv';
dotenv.config();

export const nebimConfig = {
  BASE_URL: process.env.NEBIM_URL,
  DATABASE_NAME: process.env.NEBIM_DATABASE_NAME,
  USER_GROUP_CODE: process.env.NEBIM_USER_GROUP_CODE,
  USERNAME: process.env.NEBIM_USERNAME,
  PASSWORD: process.env.NEBIM_PASSWORD,
  MODEL_TYPE: {
    CONNECT: 1,
    PRODUCT: 4,
    RUN_QUERY: 32,
    RUN_PROC: 33,
  },
};
