import path from 'path';
import { importMarketPlaceCategories, getMarketPlaceCategoryTrailsService } from '#service/categoryService.js';
import { errorResponse, successResponse } from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
/**
 * Controller: Import categories from uploaded CSV file
 * @route POST /api/import-csv
 */
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

export const getMarketPlaceCategoryTrails = async (req, res) => {
  try {
    const { productCategoryTrails } = req.params;
    const result = await getMarketPlaceCategoryTrailsService(productCategoryTrails);
    const message =
      result && result.length > 0 ? req.locale.CATEGORYTRAILS_FOUND_SUCCESS : req.locale.NO_CATEGORYTRAILS_FOUND;
    return successResponse(res, message, 200, result);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};
