import dotenv from 'dotenv';
dotenv.config();

export const gurmanConfig = {
  GURMAN_XML_FEED_URL: process.env.GURMAN_XML_FEED_URL,
};
