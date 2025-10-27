import { gurmanConfig } from '../config/config.js';
const { GURMAN_XML_FEED_URL } = gurmanConfig;

export const fetchXml = async () => {
  try {
    const response = await fetch(GURMAN_XML_FEED_URL);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    return await response.text();
  } catch (error) {
    console.error('Error fetching XML:', error.message);
    throw error;
  }
};
