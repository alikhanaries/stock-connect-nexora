import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import mongoose from 'mongoose';
import productService, { pushProductsFromDB } from '#service/productService.js';

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

export const pushProductToChannelEngine = async (req, res) => {
  try {
    const maxProducts = Math.max(1, parseInt(req.query.limit || '500', 10));

    // 🔹 Background push (fire-and-forget)
    setImmediate(async () => {
      try {
        await pushProductsFromDB(maxProducts);
        console.log(`Background push completed for up to ${maxProducts} products`);
      } catch (err) {
        console.error('Background push error:', err);
      }
    });

    // 🔹 Return early
    return successResponse(res, 'Products push started in background', 202, {
      message: `Up to ${maxProducts} products will be pushed`,
    });
  } catch (err) {
    console.error('Controller Error:', err);
    return errorResponse(res, err, 500);
  }
};
/* DELETE PRODUCT BY ID*/
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
