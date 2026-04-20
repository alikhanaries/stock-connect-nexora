import {
  createFullShipmentService,
  getAllShipmentsService,
  getAllShipmentsAdminService,
  ayMakanWebHookService,
  getSingleShipmentService,
  cancelShipmentService,
  createReverseShipmentService,
  createManualShipmentService,
  downloadShipmentLabelService,
} from '#service/shipmentService.js';
import { errorResponse, successResponse, failResponse } from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import { SHIPMENT_EXPORT_HEADERS, USER_ROLES } from '#constants/common.js';
import Seller from '../models/Seller.js';
import { exportShipmentToCSV } from '../service/shipmentExportService.js';

export const createShipment = async (req, res) => {
  try {
    const shipmentData = req.body;
    const userId = req.user._id;
    shipmentData['userId'] = userId;
    // Validate request body early
    if (!shipmentData || Object.keys(shipmentData).length === 0) {
      return errorResponse(res, 'Shipment data is required', 400);
    }

    const result = await createFullShipmentService(shipmentData);

    if (!result.success) {
      // This can happen if service returns false for invalid inputs
      return failResponse(res, result?.message || 'Shipment could not be created', 400);
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
    const sellerId = req.sellerId;
    const { page = 1, size = 10, status, search, sortOrder } = req.query;

    const { shipments, pagination, appliedFilters } = await getAllShipmentsService({
      page,
      size,
      status,
      sellerId,
      search,
      sortOrder,
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

export const getAllShipmentsAdmin = async (req, res) => {
  try {
    if (req.user.role !== USER_ROLES.MASTER_ADMIN) {
      return errorResponse(res, `User role ${req.user.role} is not authorized to access this route`, 403);
    }
    const { page = 1, size = 10, status, sellerId, search, sortOrder } = req.query;

    const { shipments, pagination, appliedFilters } = await getAllShipmentsAdminService({
      page,
      size,
      status,
      sellerId,
      search,
      sortOrder,
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

export const ayMakanWebHook = async (req, res) => {
  try {
    console.log('webhook api calling-------------------------------------');
    const payload = req.body;

    // Basic validation: check for tracking number & status
    if (!payload?.tracking || !payload?.status) {
      return errorResponse(res, 'Invalid webhook payload: missing tracking_number or status', 400);
    }

    // Process webhook
    const result = await ayMakanWebHookService(payload);

    if (!result || result.success === false) {
      return errorResponse(res, result?.message || 'Shipment could not be updated', 400);
    }

    // Respond with 200 instead of 201 (nothing is “created” here)
    return successResponse(res, result?.message || 'Shipment updated successfully', 200, {
      shipmentId: result?.shipmentId,
    });
  } catch (error) {
    console.error(' AyMakan Webhook Error:', error.message, error.stack);
    errorLog(error);

    return errorResponse(res, error?.message || 'Unexpected error while updating shipment', 500);
  }
};

export const getSingleShipment = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getSingleShipmentService(id);
    if (!result) return failResponse(res, 'Shipment not found', 404, null);
    return successResponse(res, 'Shipment found', 200, result);
  } catch (error) {
    console.error('Get Shipment Controller Error:', error.message, error.stack);
    errorLog(error);
    return errorResponse(res, error?.message || 'Internal server error', 400);
  }
};

export const cancelShipment = async (req, res) => {
  try {
    const { shipmentId, reason } = req.body;
    // Call service
    const result = await cancelShipmentService(shipmentId, reason);
    if (!result.success) {
      return failResponse(res, result?.message || 'No shipment found', 404);
    }

    return successResponse(res, result.message || 'Shipment cancelled successfully', 200, {
      shipmentId: result?.shipmentId,
    });
  } catch (error) {
    console.error('Cancel Shipment Controller Error:', error.message, error.stack);
    errorLog(error);

    return errorResponse(res, error?.message || 'Shipment could not be cancelled', 500);
  }
};

//CREATE REVERSE SHIPMENT
export const createReverseShipment = async (req, res) => {
  try {
    const shipmentData = req.body;
    const userId = req.user._id;
    shipmentData['userId'] = userId;
    // Validate request body early
    if (!shipmentData || Object.keys(shipmentData).length === 0) {
      return errorResponse(res, 'Return shipment data is required', 400);
    }

    const result = await createReverseShipmentService(shipmentData);

    if (!result.success) {
      return failResponse(res, result.message || 'Failed to approve return', result?.statusCode || 500);
    }

    return successResponse(res, result.message || 'Return request is approved', 201, {
      shipmentId: result?.shipmentId,
    });
  } catch (error) {
    console.error('Controller Error: createMerchantReturn:', error.message);
    errorLog(error);
    return errorResponse(res, error.message, 500);
  }
};

export const createManualShipment = async (req, res) => {
  try {
    const shipmentData = req.body;
    const userId = req.user._id;
    shipmentData['userId'] = userId;

    // Validate request body
    if (!shipmentData || Object.keys(shipmentData).length === 0) {
      return errorResponse(res, 'Shipment data is required', 400);
    }

    const result = await createManualShipmentService(shipmentData);

    if (!result.success) {
      return failResponse(res, result?.message || 'Manual shipment could not be created', 400);
    }

    return successResponse(res, result?.message || 'Manual shipment created successfully', 201, {
      shipmentId: result?.shipmentId,
      airWaybillNo: result?.airWaybillNo,
      merchantShipmentNo: result?.merchantShipmentNo,
    });
  } catch (error) {
    console.error('Create Manual Shipment Controller Error:', error.message, error.stack);
    errorLog(error);

    return errorResponse(res, error?.message || 'Manual shipment could not be created', 400);
  }
};

export const exportShipmentController = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { status, sortOrder, search } = req.query;

    const seller = await Seller.findById(sellerId).select('name').lean();

    if (!seller) {
      return failResponse(res, req.locale?.SELLER_NOT_FOUND || 'Seller not found', 404);
    }

    const filters = {};
    if (status) filters.status = status;
    if (sortOrder) filters.sortOrder = sortOrder;
    if (search) filters.search = search;

    const sellerName = seller.name.replace(/[^a-zA-Z0-9]/g, '');
    const exportDate = new Date().toISOString().split('T')[0];
    const label = 'shipmentData';
    const filename = `${sellerName}_${label}_${exportDate}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.write('\uFEFF');

    res.write(SHIPMENT_EXPORT_HEADERS.join(',') + '\n');

    await exportShipmentToCSV(sellerId, filters, res);

    return res.end();
  } catch (error) {
    console.error('Controller Error: exportShipmentController:', error.message);
    errorLog(error);

    if (res.headersSent) {
      try {
        if (typeof res.end === 'function' && !res.writableEnded) {
          res.end();
        }
      } catch (endError) {
        console.error('Error while ending response after export failure:', endError.message);
      }
      return;
    }

    return errorResponse(res, error.message, 500);
  }
};

export const downloadAymakanShipmentLabel = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { sellerId } = req.query;

    const result = await downloadShipmentLabelService(shipmentId, sellerId);

    if (!result.success) {
      return failResponse(res, result.message, result.status || 400);
    }

    return successResponse(res, 'PDF label fetched successfully', 200, result.data);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
