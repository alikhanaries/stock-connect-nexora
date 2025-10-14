import { config } from '../config/config.js';
const { AYMAKAN_API_KEY, AYMAKAN_API_URL } = config;

export const getAymakanShipmentCitiesAPI = async () => {
  try {
    // Call Aymakan API
    const response = await fetch(`${AYMAKAN_API_URL}cities`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AYMAKAN_API_KEY,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    }

    // Parse JSON body
    const result = await response.json().catch(async () => {
      const errorData = await response.json();
      throw new Error(errorData?.message);
    });

    return result;
  } catch (error) {
    console.error('Aymakan Service Error:', error.message, error.stack);
    throw error;
  }
};
