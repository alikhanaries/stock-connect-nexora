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

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
export const importProductsFromGoogleSheet = async (req, res) => {
  try {
    if (!req.body.url) {
      return failResponse(res, 'Google Sheet URL required', 400);
    }
    const { url } = req.body;
    const result = await productService.importProductsFromGoogleSheet(url);
    // Handle failure from service
    if (!result?.success) {
      return failResponse(res, result?.message || 'Error in upload', 500);
    }

    // Success response with details
    return successResponse(res, result.message, 200, {
      insertedCount: result.insertedCount,
      invalidRowsCount: result.invalidRowsCount,
      errorRows: result.errorRows,
    });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return errorResponse(res, error.message);
  }
};

/* UPLOAD PRODUCTS FROM CSV FILE */
export const importProductsFromCsvFile = async (req, res) => {
  try {
    // Call service
    const result = await productService.importProductsFromCsvFile(req.file.path);

    // Handle failure from service
    if (!result?.success) {
      return failResponse(res, result?.message || 'Error in upload', 500);
    }

    // Success response with details
    return successResponse(res, result.message, 200, {
      insertedCount: result.insertedCount,
      invalidRowsCount: result.invalidRowsCount,
      errorRows: result.errorRows,
    });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return errorResponse(res, error.message);
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
    const { ids, active } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return failResponse(res, 'Product IDs are required', 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return failResponse(res, `Invalid product IDs: ${invalidIds.join(', ')}`, 400);
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

/* DELETE MULTIPLE PRODUCTS BY ID*/
export const deleteMultipleProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return failResponse(res, 'Product IDs are required', 400);
    }

    // Validate all IDs
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length) {
      return failResponse(res, `Invalid IDs: ${invalidIds.join(', ')}`, 400);
    }
    const result = await productService.deleteMultipleProducts(ids);
    if (!result.success) {
      return failResponse(res, result.message || 'Failed to delete product', 400);
    }

    return successResponse(res, result.message || 'Product deleted successfully', 200);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, error);
  }
};
