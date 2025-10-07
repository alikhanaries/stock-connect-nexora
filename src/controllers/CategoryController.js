import {
  mapCategoryService,
  getStockConnectCategoriesService,
  importMarketPlaceCategories,
  getMarketplaceCategoriesService,
  getMarketPlaceCategoryTrailsService,
} from '#service/categoryService.js';
import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import Channel from '../models/Channel.js';
import { errorLog } from '#middleware/index.js';
import path from 'path';

export const getStockConnectCategories = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const result = await getStockConnectCategoriesService(req.query.search, sellerId);
    if (result && result.length === 0) {
      return successResponse(res, req.locale.CATEGORY_NOT_FOUND, 200, []);
    }
    return successResponse(res, req.locale.CATEGORY_FOUND, 200, result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const importMarketPlaceCategoriesFromCsv = async (req, res) => {
  try {
    const filePath = path.resolve(req.file.path);

    // Send immediate response to client
    successResponse(res, req.locale.CATEGORY_IMPORTED_PROCESSING, 200);

    // Process file in background (async, no await here)
    importMarketPlaceCategories(filePath, req.params.marketPlaceId)
      .then((result) => {
        console.log('CSV processing completed:', result);
        // Optionally update DB with processing status
      })
      .catch((error) => {
        console.error('Error in background CSV processing:', error.message);
        // Optionally store error in DB for tracking
      });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const mapCategory = async (req, res) => {
  try {
    const { marketPlaceId, categoryDatas } = req.body;
    const sellerId = req.sellerId;
    // Check if referenced Marketplace exists
    const marketplaceExists = await Channel.findOne({ channelId: marketPlaceId });
    if (!marketplaceExists) {
      return failResponse(res, req.locale.MARKETPLACE_NOT_FOUND, 404);
    }

    // Call service (bulk upsert)
    const result = await mapCategoryService(categoryDatas, marketPlaceId, sellerId);

    // bulkWrite returns an object with nUpserted, nModified, etc.
    const totalProcessed = (result.upsertedCount || 0) + (result.modifiedCount || 0);

    if (totalProcessed > 0) {
      return successResponse(res, req.locale.CATEGORY_PROCESSED_SUCCESS, 201);
    } else {
      return failResponse(res, req.locale.CATEGORY_NOT_SAVED, 400);
    }
  } catch (error) {
    console.error('Error in mapCategory:', error);
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};

export const getMarketplaceCategories = async (req, res) => {
  try {
    const { marketPlaceId } = req.params;

    const result = await getMarketplaceCategoriesService(marketPlaceId, req.query.search);
    if (result.length === 0) {
      return successResponse(res, req.locale.CATEGORY_NOT_FOUND, 200, []);
    }
    return successResponse(res, req.locale.CATEGORY_FOUND, 200, result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getMarketPlaceCategoryTrails = async (req, res) => {
  try {
    const { productCategoryTrail } = req.params;
    const sellerId = req.sellerId;
    const result = await getMarketPlaceCategoryTrailsService(productCategoryTrail, sellerId);

    const message =
      result && result.length > 0 ? req.locale.CATEGORYTRAILS_FOUND_SUCCESS : req.locale.NO_CATEGORYTRAILS_FOUND;
    return successResponse(res, message, 200, result);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};
