import { errorResponse, successResponse } from '#helpers/response.js';
import { getStockConnectCategoriesService } from '../service/categoryService.js';

export const getStockConnectCategories = async (req, res) => {
  try {
    const result = await getStockConnectCategoriesService(req.query.search);
    if (result && result.length === 0) {
      return successResponse(res, req.locale.CATEGORY_NOT_FOUND, 200, []);
    }
    return successResponse(res, req.locale.CATEGORY_FOUND, 200, result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
