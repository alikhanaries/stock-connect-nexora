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

export const pushProductToChannelEngine = async (req, res) => {
  try {
    const products = req.body;

    // Validate input
    if (!Array.isArray(products) || products.length === 0) {
      return failResponse(res, 'No products provided', 400);
    }

    const { Content: content = {} } = await productService.pushProducts(products);
    const { AcceptedCount = 0, RejectedCount = 0 } = content;

    // Decide response
    if (AcceptedCount && !RejectedCount) {
      return successResponse(res, 'All products pushed successfully', 200, content);
    }

    if (AcceptedCount && RejectedCount) {
      return successResponse(res, 'Some products pushed successfully, some rejected', 207, content);
    }

    if (RejectedCount && !AcceptedCount) {
      return failResponse(res, 'All products were rejected', 422, content);
    }

    // Nothing processed
    return failResponse(res, 'No products processed', 400, content);
  } catch (err) {
    console.error('Controller Error:', err);
    return errorResponse(res, err, 500);
  }
};
