import { errorResponse, failResponse, successResponse } from '#helpers/response.js';
import productService from '#service/productService.js';

export const getProducts = async (req, res) => {
  try {
    const { products, pagination } = await productService.getProducts(req.query);

    if (!products.length) {
      return failResponse(res, 'No products found', 404, { content: [], ...pagination });
    }
    return successResponse(res, 'Products fetched successfully', 200, { content: products, ...pagination });
  } catch (err) {
    console.error('Error fetching products:', err);
    return errorResponse(res, err, 500);
  }
};
