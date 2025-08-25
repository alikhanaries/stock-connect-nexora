import { errorResponse, failResponse, successResponse } from '#helpers/response.js';
import productService from '#service/productService.js';

export const getProducts = async (req, res) => {
  try {
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query);

    if (!products.length) {
      return failResponse(res, 'No products found', 404, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return successResponse(res, 'Products fetched successfully', 200, {
      content: products,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    return errorResponse(res, err, 500);
  }
};
