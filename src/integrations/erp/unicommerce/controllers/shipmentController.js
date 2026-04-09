import {
  errorResponse,
  failResponse,
  successResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';
import { getLabelsService } from '../services/shipmentService.js';

export const getLabels = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    if (!sellerId) {
      return failResponse(res, 400, { message: 'sellerId is missing' });
    }
    const { orderItemIds } = req.query;
    const base64Label = await getLabelsService(sellerId, orderItemIds);
    if (!base64Label) {
      return failResponse(res, 404, { message: 'Label not found or empty for the provided order item IDs' });
    }
    return successResponse(res, 200, base64Label);
  } catch (error) {
    console.error('getLabels error:', error.message, error.stack);
    return errorResponse(res, 500, error.message);
  }
};
