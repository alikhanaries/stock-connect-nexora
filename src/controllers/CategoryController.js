import { errorResponse, successResponse } from '#helpers/response.js';
import { getPlatformCategoriesService } from '../service/categoryService.js';

export const getPlatformCategories = async (req, res) => {
  try {
    const result = await getPlatformCategoriesService();
    console.log(result);
    if (result.length === 0) {
      return successResponse(res, req.locale.CATEGORY_NOT_FOUND, 200, []);
    }
    return successResponse(res, req.locale.CATEGORY_FOUND, 200, result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
