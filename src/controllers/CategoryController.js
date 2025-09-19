import { mapCategoryService } from '#service/categoryService.js';
import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import Channel from '../models/Channel.js';
import { errorLog } from '#middleware/index.js';
/**
 * Controller: Import categories from uploaded CSV file
 * @route POST /api/import-csv
 */
export const mapCategory = async (req, res) => {
  try {
    const { marketPlaceId, categoryDatas } = req.body;

    // Check if referenced Marketplace exists
    const marketplaceExists = await Channel.findOne({ channelId: marketPlaceId });
    if (!marketplaceExists) {
      return failResponse(res, req.locale.MARKETPLACE_NOT_FOUND, 404);
    }

    // Call service
    const result = await mapCategoryService(categoryDatas, marketPlaceId);

    if (result.modifiedCount > 0 || result.upsertedCount > 0) {
      return successResponse(res, req.locale.CATEGORY_PROCESSED_SUCCESS, 201);
    } else {
      return failResponse(res, req.locale.CATEGORY_NOT_SAVED, 400);
    }
  } catch (error) {
    console.error('Error in getParentMarketplaceCategoryList:', error);
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};
