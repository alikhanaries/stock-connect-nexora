import { errorResponse, successResponse } from '#helpers/response.js';
import productService from '#service/productService.js';

export const getProducts = async (req, res) => {
  try {
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query);
    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products.length ? 'Products fetched successfully' : 'No products found';
    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error fetching products:', error);
    return errorResponse(res, error, 500);
  }
};

export const getTopSellingProduct = async (req, res) => {
  try {
    const limit = parseInt(req.query.size) || 5;

    const topProducts = await productService.getTopSellingProduct(limit);

    const message =
      topProducts.length > 0 ? 'Top-selling products fetched successfully' : 'No top-selling products found';
    return successResponse(res, message, 200, topProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    return errorResponse(res, error, 500);
  }
};
