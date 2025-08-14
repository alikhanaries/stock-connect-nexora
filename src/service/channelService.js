import axios from 'axios';
import { config } from '#config/config.js';

const { CHANNEL_ENGINE, CHANNEL_ENGINE_API_KEY } = config;

// Axios client with default params
const apiClient = axios.create({
  baseURL: `https://${CHANNEL_ENGINE}.channelengine.net/api/v2`,
  params: { apikey: CHANNEL_ENGINE_API_KEY },
});

// Endpoints
const ENDPOINTS = {
  PRODUCTS: '/products',
  CHANNELS: '/channels',
};

// Generic GET request
const getRequest = async (url, params = {}) => {
  try {
    const { data } = await apiClient.get(url, { params });
    return data;
  } catch (error) {
    console.error(`GET ${url} failed:`, error.response?.data || error.message);
    throw error;
  }
};

// Generic POST request
const postRequest = async (url, payload = {}) => {
  try {
    const { data } = await apiClient.post(url, payload);
    return data;
  } catch (error) {
    console.error(`POST ${url} failed:`, error.response?.data || error.message);
    throw error;
  }
};

const channelEngineService = {
  /**
   * Get products with pagination, search, and filtering
   * @param {Object} options
   * @param {number} options.page - Page number
   * @param {number} options.limit - Items per page
   * @param {string} [options.search] - Search keyword
   * @param {boolean} [options.isActive] - Filter by active status
   * @param {string} [options.merchantProductNo] - Filter by product number
   */
  getProducts: ({ page = 1, limit = 10, search, isActive, merchantProductNo } = {}) => {
    const params = {
      page,
      pageSize: limit,
    };

    // Apply optional filters
    if (search) params.search = search;
    if (typeof isActive === 'boolean') params.isActive = isActive;
    if (merchantProductNo) params.merchantProductNo = merchantProductNo;

    return getRequest(ENDPOINTS.PRODUCTS, params);
  },

  addProducts: (products) => postRequest(ENDPOINTS.PRODUCTS, products),

  getChannels: () => getRequest(ENDPOINTS.CHANNELS),
};

export default channelEngineService;
