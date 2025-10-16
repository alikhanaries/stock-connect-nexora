import { createPartialShipmentService, getAllShipmentsService } from '#service/shipmentService.js';
import { errorResponse, successResponse } from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

export const createShipment = async (req, res) => {
  try {
    const shipmentData = req.body;
    const userId = req.user._id;
    shipmentData['userId'] = userId;
    // Validate request body early
    if (!shipmentData || Object.keys(shipmentData).length === 0) {
      return errorResponse(res, 'Shipment data is required', 400);
    }

    const result = await createPartialShipmentService(shipmentData);

    if (!result.success) {
      // This can happen if service returns false for invalid inputs
      return errorResponse(res, result?.message || 'Shipment could not be created', 400);
    }

    return successResponse(res, result?.message || 'Shipment created successfully', 201, {
      shipmentId: result?.shipmentId,
    });
  } catch (error) {
    console.error('Create Shipment Controller Error:', error.message, error.stack);
    errorLog(error);

    return errorResponse(res, error?.message || 'Shipment could not be created', 400);
  }
};

export const getAllShipments = async (req, res) => {
  try {
    const { page = 1, size = 10, status, search, sellerId } = req.query;

    const { shipments, pagination, appliedFilters } = await getAllShipmentsService({
      page,
      size,
      status,
      sellerId,
      search,
    });
    const responseData = {
      content: shipments || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    const message = shipments && shipments.length > 0 ? 'Shipments fetched successfully' : 'No shipments found';

    return successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Get Shipment Controller Error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error?.message || 'Internal server error', 400);
  }
};
