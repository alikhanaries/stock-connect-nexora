import dotenv from 'dotenv';
dotenv.config();

export const ramseyConfig = {
  RAMSEY_XML_FEED_URL: process.env.RAMSEY_XML_FEED_URL,
};
