import productService from '../services/productService.js';
import {
  errorResponse,
  successResponse,
  failResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const fetchProductCount = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { publishedStatus } = req.query;
    const result = await productService.fetchProductsCount(sellerId, publishedStatus);
    return successResponse(res, 200, {
      count: result.count ?? 0,
    });
  } catch (error) {
    console.error('unicommerce fetchProductCount error:', error.message, error.stack);
    return errorResponse(res, 500, { message: error.message });
  }
};

export const fetchProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const result = await productService.fetchProducts(sellerId, req.query);
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('fetchProducts error:', error.message, error.stack);
    return errorResponse(res, 500, { message: error.message });
  }
};
