import path from 'path';
import { importPlatformCategories } from '#service/categoryService.js';
import { errorResponse, successResponse } from '#helpers/response.js';
/**
 * Controller: Import categories from uploaded CSV file
 * @route POST /api/import-csv
 */
export const importPlatformCategoriesFromCsv = async (req, res) => {
  try {
    const filePath = path.resolve(req.file.path);

    // Send immediate response to client
    successResponse(res, req.locale.CATEGORY_IMPORTED_PROCESSING, 200);

    // Process file in background (async, no await here)
    importPlatformCategories(filePath)
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
