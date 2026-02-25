import productService from '../services/productService.js';
import {
  successResponse,
  failResponse,
  errorResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const fetchProductCount = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!sellerId) {
      failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const { publishedStatus } = req.query;

    if (!publishedStatus || typeof publishedStatus !== 'string') {
      failResponse(res, 400, { message: 'Published status is required' });
    }

    if (publishedStatus.toUpperCase() !== 'PUBLISHED') {
      failResponse(res, 400, { message: 'Published status must be PUBLISHED' });
    }

    const result = await productService.fetchProductsCount(sellerId, publishedStatus);

    successResponse(res, 200, { count: result.count });
  } catch (error) {
    console.error('unicommerce fetchProductCount error:', error.message, error.stack);
    errorResponse(res, 500, { message: error.message });
  }
};

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const result = await productService.fetchProducts(sellerId, req.query);
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('fetchProducts error:', error);
    return errorResponse(res, 500, { message: error.message });
  }
};
