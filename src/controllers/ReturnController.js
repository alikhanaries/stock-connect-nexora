import returnService from '#service/returnService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';
import mongoose from 'mongoose';

// Gets all returns stored in the database with pagination and filtering.

export const getAllReturns = async (req, res) => {
  try {
    const result = await returnService.getReturnsFromDatabase(req.query);

    if (result.success && !result.success) {
      return Responses.failResponse(res, result.message || 'Returns not Found', 400);
    }

    const { data: returns = [], pagination = {}, appliedFilters = {} } = result;

    if (!returns.length) {
      return Responses.successResponse(res, result.message || 'No returns found', 200, {
        content: [],
        appliedFilters: appliedFilters || {},
        ...pagination,
      });
    }

    return Responses.successResponse(res, result.message || 'Returns fetched successfully', 200, {
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
      return Responses.failResponse(res, result.message || 'Failed to sync returns', 400);
    }

    const returnsCount = result.data?.Content?.length || 0;
    const message =
      returnsCount > 0 ? `${returnsCount} returns synced successfully from ChannelEngine` : 'No new returns found';

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
      return Responses.failResponse(res, result.message || 'Failed to create return', result.statusCode || 500);
    }

    if (result.isConflict) {
      return Responses.failResponse(res, result.message || 'A return with this reference already exists', 409);
    }

    const message = 'Return created successfully in ChannelEngine';
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
    const stats = await returnService.getReturnStats();
    if (!stats) {
      return Responses.failResponse(res, 'Failed to get return stats', 404);
    }
    return Responses.successResponse(res, 'Return stats fetched successfully', 200, stats);
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
      return Responses.failResponse(res, result.message || 'Failed to acknowledge return', 400);
    }

    return Responses.successResponse(res, 'Return acknowledged successfully', 200, result.data);
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
      return Responses.failResponse(res, result.message || 'Return with this reference already exists', 409);
    }

    if (!result.success) {
      return Responses.failResponse(res, result.message || 'Failed to update return', result.statusCode || 400);
    }

    return Responses.successResponse(res, 'Return updated successfully', 200, result.data);
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Responses.failResponse(res, req.locale.INVALID_RETURN_ID_FORMAT || 'Invalid return ID format', 400);
    }

    const returnData = await returnService.getReturnById(id);
    if (!returnData) {
      return Responses.failResponse(res, req.locale.NO_RETURNS_FOUND || 'Return not found', 404);
    }

    return Responses.successResponse(
      res,
      req.locale.RETURN_FETCHED_SUCCESSFULLY || 'Return fetched successfully',
      200,
      returnData
    );
  } catch (error) {
    console.error('Controller Error: getReturnById:', error.message);
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
};
