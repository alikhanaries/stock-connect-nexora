import { errorResponse, successResponse } from '#helpers/response.js';
import { getMarketplaceCategoriesService } from '../service/categoryService.js';

export const getMarketplaceCategories = async (req, res) => {
  try {
    const { marketPlaceId } = req.params;
    const result = await getMarketplaceCategoriesService(marketPlaceId);
    if (result.length === 0) {
      return successResponse(res, req.locale.CATEGORY_NOT_FOUND, 200, []);
    }
    return successResponse(res, req.locale.CATEGORY_FOUND, 200, result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
