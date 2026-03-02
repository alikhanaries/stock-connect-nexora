import {
  errorResponse,
  successResponse,
  failResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
import inventoryService from '../services/inventoryService.js';

export const updateInventory = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const { inventoryList } = req.body;
    const result = await inventoryService.updateInventory(sellerId, inventoryList);
    return successResponse(res, 200, result);
  } catch (error) {
    console.error('unicommerce updateInventory error:', error.message, error.stack);

    return errorResponse(res, 500, { message: error.message });
  }
};
