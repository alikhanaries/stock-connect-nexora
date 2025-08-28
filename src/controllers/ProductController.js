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

export const updateProductStatus = async (req, res) => {
  try {
    const { ids, active } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return failResponse(res, 'Product IDs are required', 400);
    }
    if (typeof active !== 'boolean') {
      return failResponse(res, 'Status must be true or false', 400);
    }
    const updatedCount = await productService.updateProductStatus(ids, active);
    if (updatedCount === 0) {
      return failResponse(res, 'No matching products found to update', 404);
    }
    const statusMessage = active ? 'Products activated successfully' : 'Products deactivated successfully';
    return successResponse(res, statusMessage, 200);
  } catch (err) {
    console.error('Error updating product status:', err);
    return errorResponse(res, err, 500);
  }
};
