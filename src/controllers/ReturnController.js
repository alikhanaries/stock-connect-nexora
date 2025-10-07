import returnService from '#service/returnService.js';
import Responses from '#helpers/response.js';
import { errorLog } from '#middleware/index.js';

// Gets all returns stored in the database with pagination and filtering.

export const getAllReturns = async (req, res) => {
  try {
    const result = await returnService.getReturnsFromDatabase(req.query);

    if (result.success === false) {
      return Responses.failResponse(res, result.message || 'Failed to fetch returns', 400);
    }

    const { data: returns = [], pagination = {}, appliedFilters = {} } = result;

    const message = returns.length > 0 ? 'Returns fetched successfully' : 'No returns found';

    return Responses.successResponse(res, message, 200, {
      content: returns,
      appliedFilters,
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
    // Fetch and sync returns from ChannelEngine (automatically saves to database)
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

export default {
  getAllReturns,
  syncReturns,
};
