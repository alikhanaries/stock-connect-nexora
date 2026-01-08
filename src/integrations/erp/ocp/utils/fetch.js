import { ocpConfig } from '../config/config.js';

export const fetchFromOcp = async (endpoint, options = {}) => {
  const { method = 'GET', headers = {}, query = {} } = options;
  const { OCP_URL, OCP_API_KEY } = ocpConfig;

  const sessionUrl = `${OCP_URL}/${endpoint}`;
  const queryString = new URLSearchParams(query).toString();
  const url = `${sessionUrl}${queryString ? `?${queryString}` : ''}`;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': OCP_API_KEY,
        ...headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching from OCP (${endpoint}):`, error.message);
    throw error;
  }
};

export const cancelFullOrderOcp = async (endpoint, orderId, options = {}) => {
  const { method = 'PUT', headers = {}, body = {} } = options;
  const { OCP_URL, OCP_API_KEY } = ocpConfig;

  const sessionUrl = `${OCP_URL}/${endpoint}`;
  const url = `${sessionUrl}/${orderId}/cancel`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': OCP_API_KEY,
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching from OCP (${endpoint}):`, error.message);
    throw error;
  }
};
