import dotenv from 'dotenv';
dotenv.config();

export const casabonyConfig = {
  CASABONY_XML_FEED_URL: process.env.CASABONY_XML_FEED_URL,
};
