import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import productService from '#service/productService.js';
import mongoose from 'mongoose';

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

export const deleteProduct = async (req, res) => {
  try {
    const { prId } = req.params;
    //Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(prId)) {
      return failResponse(res, 'Invalid product ID', 400);
    }
    const result = await productService.deleteProduct(prId);
    if (!result.success) {
      return failResponse(res, result.message || 'Failed to delete product', 400);
    }

    return successResponse(res, 'Product deleted successfully', 200);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, error);
  }
};
