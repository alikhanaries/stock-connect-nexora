import { errorResponse, failResponse, successResponse } from '#helpers/response.js';
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

export const updateProductStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return failResponse(res, 'Product IDs are required', 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return failResponse(res, `Invalid product IDs: ${invalidIds.join(', ')}`, 400);
    }
    if (typeof status !== 'boolean') {
      return failResponse(res, 'Status must be true or false', 400);
    }
    const updatedCount = await productService.updateProductStatus(ids, status);
    if (updatedCount === 0) {
      return failResponse(res, 'No matching products found to update', 404);
    }
    const statusMessage = status ? 'Products activated successfully' : 'Products deactivated successfully';
    return successResponse(res, statusMessage, 200);
  } catch (err) {
    console.error('Error updating product status:', err);
    return errorResponse(res, err, 500);
  }
};
