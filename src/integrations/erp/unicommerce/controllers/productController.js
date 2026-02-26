import productService from '../services/productService.js';
import { errorResponse, successResponse } from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const fetchProductCount = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { publishedStatus } = req.query;
    const result = await productService.fetchProductsCount(sellerId, publishedStatus);
    if (!result.count) {
      return successResponse(res, 200, {
        message: 'No products found',
      });
    }
    return successResponse(res, 200, {
      count: result.count,
    });
  } catch (error) {
    console.error('unicommerce fetchProductCount error:', error.message, error.stack);
    return errorResponse(res, 500, { message: error.message });
  }
};
