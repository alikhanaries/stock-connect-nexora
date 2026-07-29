import Responses from '#helpers/response.js';
import apiCallLogService from '#service/apiCallLogService.js';
import { errorLog } from '#middleware/index.js';

export const listApiCallLogs = async (req, res) => {
  try {
    const result = await apiCallLogService.listApiCallLogs(req.validatedQuery);

    if (!result.content.length) {
      return Responses.successResponse(res, 'No API call logs found', 200, {
        content: [],
        appliedFilters: result.appliedFilters,
        page: result.page,
        size: result.size,
        totalElements: result.totalElements,
        totalPages: result.totalPages,
      });
    }

    return Responses.successResponse(res, 'API call logs fetched successfully', 200, result);
  } catch (error) {
    console.error('Controller Error: listApiCallLogs:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getApiCallLogByRequestId = async (req, res) => {
  try {
    const { requestId } = req.validatedParams;
    const log = await apiCallLogService.getApiCallLogByRequestId(requestId);

    if (!log) {
      return Responses.failResponse(res, 'API call log not found', 404);
    }

    return Responses.successResponse(res, 'API call log fetched successfully', 200, log);
  } catch (error) {
    console.error('Controller Error: getApiCallLogByRequestId:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const getApiCallLogPerformance = async (req, res) => {
  try {
    const result = await apiCallLogService.getApiCallLogPerformance(req.validatedQuery);
    return Responses.successResponse(res, 'API call log performance fetched successfully', 200, result);
  } catch (error) {
    console.error('Controller Error: getApiCallLogPerformance:', error.message);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
