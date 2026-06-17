import returnService from '#service/returnService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import mongoose from 'mongoose';
import omnifullService from '#service/omnifullService.js';

// Gets all returns stored in the database with pagination and filtering.

export const getAllReturns = async (req, res) => {
  try {
    const sellerId = req.sellerId;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return Responses.failResponse(res, 'Invalid seller ID format', 400);
    }

    const { status, channel, search, dateFrom, dateTo, sortOrder, page, size } = req.query;

    const filters = Object.fromEntries(
      Object.entries({ status, channel, search, dateFrom, dateTo, sortOrder, page, size }).filter(
        ([, v]) => v != null && v !== ''
      )
    );

    // Remove undefined values
    Object.keys(filters).forEach((key) => {
      if (!filters[key]) {
        delete filters[key];
      }
    });

    const result = await returnService.getReturnsFromDatabase(filters, sellerId);

    if (result.success && !result.success) {
      return Responses.failResponse(res, result.message || req.locale.NO_RETURNS_FOUND, 400);
    }

    const { data: returns = [], pagination = {}, appliedFilters = {} } = result;

    if (!returns.length) {
      return Responses.successResponse(res, result.message || req?.locale?.NO_RETURNS_FOUND, 200, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return Responses.successResponse(res, result.message || req?.locale?.RETURNS_FETCHED_SUCCESSFULLY, 200, {
      content: returns,
      appliedFilters: appliedFilters || {},
      ...pagination,
    });
  } catch (error) {
    console.error('Controller Error: getAllReturns:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

//  Fetches latest returns from ChannelEngine and syncs them to the database.
export const syncReturns = async (req, res) => {
  try {
    const result = await returnService.getReturns(req.query);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale.FAILED_TO_SYNC_RETURNS, 400);
    }

    const upsertedCount = result.data?.upsertedCount || 0;

    const message =
      upsertedCount > 0
        ? `${upsertedCount} ${req.locale.NEW_RETURNS_SYNCED_SUCCESSFULLY || 'new returns synced successfully'}`
        : req.locale.NO_NEW_RETURNS_FOUND || 'No new returns found';

    return Responses.successResponse(res, message, 200, result.data);
  } catch (error) {
    console.error('Controller Error: syncReturns:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

// Creates a merchant return in ChannelEngine.
export const createMerchantReturn = async (req, res) => {
  try {
    const result = await returnService.createReturn(req.body);

    if (!result.data) {
      return Responses.failResponse(
        res,
        result.message || req.locale.FAILED_TO_CREATE_RETURN,
        result.statusCode || 500
      );
    }

    if (result.isConflict) {
      return Responses.failResponse(res, result.message || req.locale.RETURN_ALREADY_EXISTS, 409);
    }

    const message = req.locale.RETURN_CREATED_SUCCESSFULLY;
    return Responses.successResponse(res, message, 201, result.data);
  } catch (error) {
    console.error('Controller Error: createMerchantReturn:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
// Gets return stats grouped by status.
export const getReturnStats = async (req, res) => {
  try {
    const result = await returnService.getReturnStats({
      ...req.query,
      sellerId: req.sellerId,
    });
    if (!result || !result.stats) {
      return Responses.failResponse(res, req.locale.FAILED_TO_GET_RETURN_STATS, 404);
    }

    const responseData = {
      ...result.stats,
    };

    return Responses.successResponse(res, req.locale.RETURN_STATS_FETCHED_SUCCESSFULLY, 200, responseData);
  } catch (error) {
    console.error('Controller Error: getReturnStats:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
// Acknowledges a merchant return in ChannelEngine.
export const acknowledgeMerchantReturn = async (req, res) => {
  try {
    const result = await returnService.acknowledgeReturn(req.body);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale.FAILED_TO_ACKNOWLEDGE_RETURN, 400);
    }

    return Responses.successResponse(res, req.locale.RETURN_ACKNOWLEDGED_SUCCESSFULLY, 200, result.data);
  } catch (error) {
    console.error('Controller Error: acknowledgeMerchantReturn:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

// Updates a return status in ChannelEngine.
export const updateReturn = async (req, res) => {
  try {
    const result = await returnService.acceptOrRejectReturn(req.body);

    if (result.isConflict) {
      return Responses.failResponse(res, result.message || req.locale.RETURN_WITH_REFERENCE_EXISTS, 409);
    }

    if (!result.success) {
      return Responses.failResponse(
        res,
        result.message || req.locale.FAILED_TO_UPDATE_RETURN,
        result.statusCode || 400
      );
    }

    return Responses.successResponse(res, req.locale.RETURN_UPDATED_SUCCESSFULLY, 200, result.data);
  } catch (error) {
    console.error('Controller Error: updateReturn:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

// Gets a single return by ID.
export const getReturnById = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.sellerId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Responses.failResponse(res, req.locale.INVALID_RETURN_ID_FORMAT || 'Invalid return ID format', 400);
    }
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return Responses.failResponse(res, 'Invalid seller ID format', 400);
    }
    const returnData = await returnService.getReturnById(id, sellerId);
    if (!returnData) {
      return Responses.failResponse(res, req?.locale?.NO_RETURNS_FOUND || 'Return not found', 404);
    }

    return Responses.successResponse(
      res,
      req?.locale?.RETURN_FETCHED_SUCCESSFULLY || 'Return fetched successfully',
      200,
      returnData
    );
  } catch (error) {
    console.error('Controller Error: getReturnById:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

// Exports returns data as CSV file for a specific seller.
export const exportReturns = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { status, channel, search, dateFrom, dateTo } = req.query;

    const filters = Object.fromEntries(
      Object.entries({ status, channel, search, dateFrom, dateTo }).filter(([, v]) => v != null && v !== '')
    );

    // Remove undefined values
    Object.keys(filters).forEach((key) => {
      if (!filters[key]) {
        delete filters[key];
      }
    });

    const result = await returnService.exportReturnsToCSV(sellerId, filters);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale.NO_RETURNS_FOUND, 404);
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    return res.status(200).send(result.data);
  } catch (error) {
    console.error('Controller Error: exportReturns:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
// Webhook
export const fetchReturnsWebhook = async () => {
  try {
    console.log('inside  fetchReturnsWebhook-------------------');
    const query = {
      page: 1,
      pageSize: 10,
      sort: 'CreatedAt',
    };

    const result = await returnService.getReturnsForWebhook(query);

    if (!result.success) {
      console.error('Return sync failed:', result.message || result.error);
    }

    const returnsCount = result.data?.length || 0;
    const message = returnsCount > 0 ? `${returnsCount} returns synched successfully` : 'No new returns found';

    console.log(message);
  } catch (error) {
    console.error('Controller Error: fetchReturnsWebhook:', error.message);
    errorLog(error);
  }
};

// Handles Omniful QC webhook
export const handleOmnifulQCWebhook = async (req, res) => {
  try {
    console.log('in side omniful webhook----------------------');
    const result = await omnifullService.handleOmnifulQCWebhook(req.body);

    if (!result.success) {
      return Responses.failResponse(res, result.message || 'Failed to process QC webhook', result.statusCode || 400);
    }

    return Responses.successResponse(res, result.message || 'QC details updated successfully', 200, result.data);
  } catch (error) {
    console.error('Controller Error: handleOmnifulQCWebhook:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export default {
  getAllReturns,
  syncReturns,
  createMerchantReturn,
  getReturnStats,
  acknowledgeMerchantReturn,
  updateReturn,
  getReturnById,
  exportReturns,
  fetchReturnsWebhook,
  handleOmnifulQCWebhook,
};
