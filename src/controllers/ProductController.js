import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import mongoose from 'mongoose';
import productService from '#service/productService.js';
import emailService from '#service/emailService.js';
import { errorLog } from '#middleware/index.js';
import { convertGoogleSheetUrlToExport } from '#helpers/googleSheetFormaterHandler.js';
import { PRODUCT_STATUSES } from '#constants/common.js';
import UserChannelProducts from '#models/UserChannelProducts.js';
import Product from '#models/Product.js';

export const getProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { products, pagination, appliedFilters } = await productService.fetchProducts(req.query, sellerId);
    const responseData = {
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products.length ? req.locale.PRODUCTS_FETCHED_SUCCESSFULLY : req.locale.NO_PRODUCTS_FOUND;
    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error fetching products:', error);
    errorLog(error);
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
    errorLog(error);
    return errorResponse(res, error, 500);
  }
};
/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
export const importProductsFromGoogleSheet = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { url } = req.body;
    if (!req.body.url) {
      return failResponse(res, req.locale.GOOGLE_SHEET_URL_REQUIRED, 400);
    }
    const exportUrl = await convertGoogleSheetUrlToExport(url);
    if (!exportUrl) {
      return failResponse(res, req.locale.INVALID_URL, 500);
    }
    // Send immediate response to client
    successResponse(res, req.locale.PRODUCT_IMPORTED_PROCESSING, 200);
    // Process file in background (async, no await here)
    productService
      .importProductsFromGoogleSheet(exportUrl, req.locale, sellerId)
      .then((result) => {
        console.log('CSV processing completed:', result);
        // Send email notification after processing
        emailService.importProductMailService({
          to: req.user.email,
          userName: req.user.firstName,
          importStatus: result.success ? 'SUCCESS' : 'FAILED',
          errorDetails: result.errorDetails || [],
        });
        // Optionally update DB with processing status
      })
      .catch((error) => {
        console.error('Error in background CSV processing:', error.message);
        // Optionally store error in DB for tracking
      });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

/* UPLOAD PRODUCTS FROM CSV FILE */
export const importProductsFromCsvFile = async (req, res) => {
  try {
    // Send immediate response to client
    successResponse(res, req.locale.PRODUCT_IMPORTED_PROCESSING, 200);
    // Call service
    const sellerId = req.sellerId;

    // Process file in background (async, no await here)
    productService
      .importProductsFromCsvFile(req.file.path, req.locale, sellerId)
      .then((result) => {
        console.log('CSV processing completed:', result.errorDetails);
        // Send email notification after processing
        emailService.importProductMailService({
          to: req.user.email,
          userName: req.user.firstName,
          importStatus: result.success ? 'SUCCESS' : 'FAILED',
          errorDetails: result.errorDetails || [],
        });
        // Optionally update DB with processing status
      })
      .catch((error) => {
        console.error('Error in background CSV processing:', error.message);
        // Optionally store error in DB for tracking
      });
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message);
  }
};

export const pushProductToChannelEngine = async (req, res) => {
  const { channelId } = req.params;
  try {
    const sellerId = req.sellerId;
    const { validProducts = [] } = await productService.validateProducts(channelId, sellerId);
    if (validProducts?.length) {
      (async () => {
        try {
          await productService.pushProductsAsync(validProducts, channelId, sellerId);
        } catch (err) {
          console.error('Async push failed:', err);
        }
      })();
    }
    return successResponse(res, req.locale.ALL_PRODUCTS_PUSH_SUCCESS, 200, null);
  } catch (err) {
    console.error('Controller Error:', err);
    errorLog(err);
    return errorResponse(res, err.message || 'Internal Server Error', 500);
  }
};

export const updateProductStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    const sellerId = req.sellerId;

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
    const updatedCount = await productService.updateProductStatus(ids, status, sellerId);
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
    errorLog(err);
    return errorResponse(res, err, 500);
  }
};
/* DELETE PRODUCT BY ID*/
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.sellerId;
    //Validate ObjectId
    const result = await productService.deleteProduct(id, req.locale, sellerId);
    if (!result.success) {
      return failResponse(res, result.message || req.locale.PRODUCT_DELETE_FAILED, 400);
    }

    return successResponse(res, result.message || req.locale.PRODUCT_DELETE_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    errorLog(error);
    return errorResponse(res, error);
  }
};

// GET PRODUCT BY ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const locale = req.locale;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return failResponse(res, locale?.INVALID_PRODUCT_ID, 400);
    }

    const result = await productService.getProductById(id, locale);

    if (!result.success) {
       return failResponse(res, result?.message || locale?.PRODUCT_FETCH_FAILED , 400);
    }

    return successResponse(res, locale?.PRODUCT_FETCH_SUCCESS, 200 , result.data);

  } catch (error) {
    console.error('Error:', error);
    errorLog(error);
    return errorResponse(res, error);
  }
};

/* DELETE MULTIPLE PRODUCTS BY ID*/
export const deleteMultipleProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    const sellerId = req.sellerId;
    const result = await productService.deleteMultipleProducts(ids, req.locale, sellerId);
    if (!result.success) {
      return failResponse(res, result.message || req.locale.PRODUCT_DELETE_FAILED, 400);
    }

    return successResponse(res, result.message || req.locale.PRODUCT_DELETE_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    errorLog(error);
    return errorResponse(res, error);
  }
};
/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
export const addProductsToUserChannel = async (req, res) => {
  try {
    const { ids, addAll } = req.body;
    const { id } = req.params;
    const sellerId = req.sellerId;

    let productIds = addAll === true ? await productService.getAllProductIdsBySellerId(sellerId) : ids;

    if (!productIds || productIds.length === 0) {
      return failResponse(res, req.locale.NO_PRODUCTS_FOUND, 404);
    }

    const assignedSku = await UserChannelProducts.findOne(
      {
        sellerId: new mongoose.Types.ObjectId(sellerId),
        channelId: Number(id),
        isActive: true,
      },
      { 'skuList.skuCode': 1 }
    ).lean();

    const assignedSkuCodes = assignedSku?.skuList?.map((s) => s.skuCode) || [];

    if (assignedSkuCodes.length > 0) {
      const assignedProducts = await Product.find(
        {
          productSkuCode: { $in: assignedSkuCodes },
          sellerId: new mongoose.Types.ObjectId(sellerId),
        },
        { _id: 1 }
      ).lean();

      const assignedSet = new Set(assignedProducts.map((p) => p._id.toString()));
      productIds = productIds.filter((id) => !assignedSet.has(id));
    }

    if (productIds.length === 0) {
      return failResponse(
        res,
        req.locale.ALL_PRODUCTS_ALREADY_ASSIGNED || 'All products are already assigned to this channel',
        400
      );
    }

    const result = await productService.addProductsToUserChannel(sellerId, id, productIds, req.locale);
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
    const sellerId = req.sellerId;
    const { channelId } = req.params;
    if (!channelId) {
      return errorResponse(res, req?.locale?.CHANNEL_ID_REQUIRED, 400);
    }
    const { channel, products, pagination, appliedFilters } = await productService.getUserChannelProducts(
      sellerId,
      channelId,
      req.query
    );
    const responseData = {
      channel: channel,
      content: products || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = products?.length
      ? req?.locale?.USER_CHANNEL_PRODUCTS_FETCHED_SUCCESSFULLY
      : req?.locale?.NO_USER_CHANNEL_PRODUCTS_FOUND;
    return successResponse(res, message || 'User channel products fetched successfully', 200, responseData);
  } catch (error) {
    console.error('Error fetching user channel products:', error);
    errorLog(error);
    return errorResponse(res, error?.message || 'Internal server error', 500);
  }
};

export const getUserUnassignedProducts = async (req, res) => {
  try {
    const { channelId } = req.params;
    const sellerId = req.sellerId;
    if (!channelId) {
      return errorResponse(res, { message: req.locale.CHANNEL_ID_REQUIRED }, 400);
    }
    const { products, pagination } = await productService.getUserUnassignedProducts(sellerId, channelId, req.query);

    const responseData = {
      content: products || [],
      ...pagination,
    };
    const message = products.length ? req.locale.AVAILABLE_PRODUCTS_FETCHED_SUCCESSFULLY : req.locale.NO_PRODUCTS_FOUND;

    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Error in getUserUnassignedProducts:', error);
    errorLog(error);
    return errorResponse(res, error, 500);
  }
};
export const unlinkProductFromChannel = async (req, res) => {
  try {
    const { channelId } = req.params;
    const sellerId = req.sellerId;
    const { ids } = req.body;
    if (!channelId) {
      return errorResponse(res, { message: req.locale.CHANNELID_REQUIRED }, 400);
    }
    if (!Array.isArray(ids) || !ids.length) {
      return failResponse(res, req.locale.PRODUCTIDS_REQUIRED, 400);
    }
    const updatedCount = await productService.unlinkProductFromChannel(sellerId, channelId, ids);
    if (updatedCount === 0) {
      return failResponse(res, req.locale.NO_MATCHING_PRODUCTS_FOUND, 404);
    }
    return successResponse(res, req.locale.PRODUCT_UNLINK_FROM_CHANNEL_SUCCESS, 200);
  } catch (error) {
    console.error('Error:', error);
    errorLog(error);
    return errorResponse(res, error);
  }
};

// Exports products data as CSV file for a specific seller.
export const exportProducts = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { status, search, minPrice, maxPrice, productSkuCode, sortBy, sortOrder } = req.query;

    // Build filters only with non-empty values
    const filters = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (minPrice) filters.minPrice = minPrice;
    if (maxPrice) filters.maxPrice = maxPrice;
    if (productSkuCode) filters.productSkuCode = productSkuCode;
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    // Remove any remaining undefined/empty values
    Object.keys(filters).forEach((key) => {
      if (!filters[key]) {
        delete filters[key];
      }
    });

    const result = await productService.exportProductsToCSV(sellerId, filters);

    if (!result.success) {
      return failResponse(res, result.message || req.locale.NO_PRODUCTS_FOUND, 404);
    }

    // Set headers for CSV download with UTF-8 encoding
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    // Add UTF-8 BOM for proper encoding
    const csvWithBOM = '\uFEFF' + result.data;

    return res.status(200).send(csvWithBOM);
  } catch (error) {
    console.error('Controller Error: exportProducts:', error.message);
    errorLog(error);
    return errorResponse(res, error.message, 500);
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
  getProductById,
  deleteMultipleProducts,
  getUserChannelProducts,
  getUserUnassignedProducts,
  addProductsToUserChannel,
  unlinkProductFromChannel,
  exportProducts,
};
