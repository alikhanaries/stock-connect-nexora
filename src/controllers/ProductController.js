import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import mongoose from 'mongoose';
import productService from '#service/productService.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';
import { PRODUCT_STATUSES } from '#constants/common.js';

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
    const size = parseInt(req.query.size, 10);
    const limit = Number.isInteger(size) && size > 0 ? size : 5;

    const topProducts = await productService.getTopSellingProduct(limit);

    const message =
      topProducts.length > 0 ? 'Top-selling products fetched successfully' : 'No top-selling products found';
    return successResponse(res, message, 200, topProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    return errorResponse(res, error, 500);
  }
};
/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
export const importProductsFromGoogleSheet = async (req, res) => {
  try {
    const { url } = req.body;
    if (!req.body.url) {
      return failResponse(res, req.locale.GOOGLE_SHEET_URL_REQUIRED, 400);
    }

    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) {
      return failResponse(res, req.locale.INVALID_URL, 500);
    }
    const result = await productService.importProductsFromGoogleSheet(exportUrl);
    // Handle failure from service
    if (!result?.success) {
      return failResponse(res, req.locale.PRODUCT_IMPORT_ERROR, 500);
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
      return failResponse(res, req.locale.PRODUCT_IMPORT_ERROR, 500);
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
        await productService.pushProductsFromDB(maxProducts);
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
    const statusValue = status?.toString().toLowerCase();
    if (!statusValue || !PRODUCT_STATUSES.includes(statusValue)) {
      return failResponse(res, `Status must be one of: ${PRODUCT_STATUSES.join(', ')}`, 400);
    }
    const updatedCount = await productService.updateProductStatus(ids, status);
    if (updatedCount === 0) {
      return failResponse(res, 'No matching products found to update', 404);
    }
    const statusMessage =
      statusValue === 'active' ? 'Products activated successfully' : 'Products deactivated successfully';
    return successResponse(res, statusMessage, 200);
  } catch (err) {
    console.error('Error updating product status:', err);
    return errorResponse(res, err, 500);
  }
};
/* DELETE PRODUCT BY ID*/
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    //Validate ObjectId
    const result = await productService.deleteProduct(id, req.locale);
    if (!result.success) {
      return failResponse(res, result.message || req.locale.PRODUCT_DELETE_FAILED, 400);
    }

    return successResponse(res, result.message || req.locale.PRODUCT_DELETE_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, error);
  }
};

/* DELETE MULTIPLE PRODUCTS BY ID*/
export const deleteMultipleProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    const result = await productService.deleteMultipleProducts(ids, req.locale);
    if (!result.success) {
      return failResponse(res, result.message || req.locale.PRODUCT_DELETE_FAILED, 400);
    }

    return successResponse(res, result.message || req.locale.PRODUCT_DELETE_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, error);
  }
};

export const getUnassignedProducts = async (req, res) => {
  try {
    const { marketPlaceId } = req.params;
    const userId = req.user?._id;
    if (!marketPlaceId) {
      return errorResponse(res, { message: 'marketPlaceId is required' }, 400);
    }
    const { products, pagination, appliedFilters } = await productService.getUnassignedProducts(
      userId,
      marketPlaceId,
      req.query
    );

    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };

    const message = products.length ? 'Available products fetched successfully' : 'No products found';

    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error in listAvailableProducts:', error);
    return errorResponse(res, error, 500);
  }
};

export default {
  getProducts,
  getTopSellingProduct,
  importProductsFromGoogleSheet,
  importProductsFromCsvFile,
  pushProductToChannelEngine,
  updateProductStatus,
  deleteProduct,
  deleteMultipleProducts,
  getUnassignedProducts,
};
