import { createPartialShipmentService } from '#service/shipmentService.js';
import { errorResponse, successResponse } from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const createShipment = async (req, res) => {
  try {
    const shipmentData = req.body;
    // const userId = req.user._id;
    // shipmentData['userId'] = userId;
    // Validate request body early
    if (!shipmentData || Object.keys(shipmentData).length === 0) {
      return errorResponse(res, 'Shipment data is required', 400);
    }

    const result = await createPartialShipmentService(shipmentData);
    console.log('shipment------', result);
    if (!result.success) {
      // This can happen if service returns false for invalid inputs
      return errorResponse(res, 'Shipment could not be created', 400);
    }

    return successResponse(res, 'Shipment created successfully', 201, result);
  } catch (error) {
    console.error('Create Shipment Controller Error:', error.message, error.stack);
    errorLog(error);

    return errorResponse(res, error?.message || 'Shipment could not be created', 400);
  }
};
