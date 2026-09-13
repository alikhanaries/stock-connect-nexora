import { errorResponse, successResponse } from '#root/src/helpers/response.js';
import { isSentosConfigured } from '../config/config.js';
import { testSentosConnection } from '../services/productService.js';

export const testSentosConnectionHandler = async (req, res) => {
  try {
    if (!isSentosConfigured()) {
      return errorResponse(res, 'Sentos integration is not configured');
    }

    const result = await testSentosConnection();
    return successResponse(res, 'Sentos connection successful', 200, result);
  } catch (error) {
    console.error('[Sentos Connection Test] failed:', error.message);
    return errorResponse(res, error.message);
  }
};
