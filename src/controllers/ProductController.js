import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import mongoose from 'mongoose';
import productService from '#service/productService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';
import { PRODUCT_STATUSES } from '#constants/common.js';
import User from '../models/User.js';

export const getProducts = async (req, res) => {
  try {
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query);
    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products.length ? req.locale.PRODUCTS_FETCHED_SUCCESSFULLY : req.locale.NO_PRODUCTS_FOUND;
    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error fetching products:', error);
    return errorResponse(res, error, 500);
  }
};

export const getTopSellingProduct = async (req, res) => {
  try {
    const size = parseInt(req.query.size, 10);
    const channelName = req.query.channel;
    const limit = Number.isInteger(size) && size > 0 ? size : 5;

    const topProducts = await productService.getTopSellingProduct(limit, channelName);

    const message =
      topProducts.length > 0
        ? req.locale.TOP_SELLING_PRODUCTS_FETCHED_SUCCESSFULLY
        : req.locale.NO_TOP_SELLING_PRODUCTS_FOUND;
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
    return successResponse(res, req.locale.PRODUCTS_PUSH_STARTED, 202, {
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
      return failResponse(res, req.locale.PRODUCT_IDS_REQUIRED, 400);
    }
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return failResponse(res, `${req.locale.INVALID_PRODUCT_IDS} ${invalidIds.join(', ')}`, 400);
    }
    const statusValue = status?.toString().toLowerCase();
    if (!statusValue || !PRODUCT_STATUSES.includes(statusValue)) {
      return failResponse(res, `${req.locale.STATUS_MUST_BE_ONE_OF} ${PRODUCT_STATUSES.join(', ')}`, 400);
    }
    const updatedCount = await productService.updateProductStatus(ids, status);
    if (updatedCount === 0) {
      return failResponse(res, req.locale.NO_MATCHING_PRODUCTS_FOUND_TO_UPDATE, 404);
    }
    const statusMessage =
      statusValue === 'active'
        ? req.locale.PRODUCTS_ACTIVATED_SUCCESSFULLY
        : req.locale.PRODUCTS_INACTIVATED_SUCCESSFULLY;
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
/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
export const addProductsToUserChannel = async (req, res) => {
  try {
    const { ids } = req.body;
    const { id } = req.params;
    const userId = req.user._id;
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }
    const result = await productService.addProductsToUserChannel(userId, id, ids, req.locale);

    if (!result.success) {
      return failResponse(res, result?.message, 404);
    }

    return successResponse(res, req.locale.PRODUCT_ASSIGNED_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    errorLog(error);
    return errorResponse(res, error);
  }
};

export const getUserChannelProducts = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { channelId } = req.params;
    if (!channelId) {
      return errorResponse(res, req.locale.CHANNEL_ID_REQUIRED, 400);
    }
    const { products, pagination, appliedFilters } = await productService.getUserChannelProducts(
      userId,
      channelId,
      req.query
    );
    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products?.length
      ? req.locale.USER_CHANNEL_PRODUCTS_FETCHED_SUCCESSFULLY
      : req.locale.NO_USER_CHANNEL_PRODUCTS_FOUND;
    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error fetching user channel products:', error);
    return errorResponse(res, error, 500);
  }
};

export const getUserUnassignedProducts = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user?._id;
    if (!channelId) {
      return errorResponse(res, { message: req.locale.CHANNEL_ID_REQUIRED }, 400);
    }
    const { products, pagination, appliedFilters } = await productService.getUserUnassignedProducts(
      userId,
      channelId,
      req.query
    );

    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products.length ? req.locale.AVAILABLE_PRODUCTS_FETCHED_SUCCESSFULLY : req.locale.NO_PRODUCTS_FOUND;

    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error in getUserUnassignedProducts:', error);
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
  getUserChannelProducts,
  getUserUnassignedProducts,
  addProductsToUserChannel,
};
