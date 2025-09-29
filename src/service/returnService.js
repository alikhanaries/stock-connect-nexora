import { config } from '#config/config.js';
import Return from '#models/Return.js';
import { sanitizeReturnData, validateReturnData } from '#helpers/ReturnHandler.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const { CHANNEL_GET_RETURNS_URL } = config;

/**
 * Fetches returns from ChannelEngine and saves them to the database.
 */
export const getReturns = async (queryParams) => {
  try {
    const params = new URLSearchParams(queryParams);
    params.append('apikey', process.env.CHANNEL_ENGINE_API_KEY);
    const fullUrl = `${CHANNEL_GET_RETURNS_URL}?${params.toString()}`;

    const response = await fetch(fullUrl);
    const responseData = await response.json();

    if (!response.ok) {
      return { success: false, message: `ChannelEngine API error: ${response.status}`, error: responseData };
    }

    // Save each return to the database using the new simplified format
    if (responseData.Content && Array.isArray(responseData.Content)) {
      const savePromises = responseData.Content.map((returnItem) => saveReturnToDatabase(returnItem));
      await Promise.allSettled(savePromises);
    }

    return { success: true, data: responseData };
  } catch (error) {
    return { success: false, message: 'Error communicating with ChannelEngine.', error: error.message };
  }
};

/**
 * Saves return data to the database with the new simplified structure.
 * @param {object} returnData - Raw return data from ChannelEngine.
 */
export const saveReturnToDatabase = async (returnData) => {
  try {
    // Validate return data first
    const validation = validateReturnData(returnData);
    if (!validation.success) {
      return validation;
    }

    // Sanitize return data using helper
    const sanitizationResult = sanitizeReturnData(returnData);
    if (!sanitizationResult.success) {
      return sanitizationResult;
    }

    const simplifiedReturnDocument = sanitizationResult.data;

    // Use upsert to create or update the document based on returnId
    await Return.findOneAndUpdate({ returnId: simplifiedReturnDocument.returnId }, simplifiedReturnDocument, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    return { success: true };
  } catch (error) {
    console.error('Error in saveReturnToDatabase:', error.message);
    return { success: false, message: 'Error saving return to database', error: error.message };
  }
};

/**
 * Gets returns from the local database with pagination and filtering.
 */
export const getReturnsFromDatabase = async (query) => {
  try {
    const {
      page = 1,
      size = 10,
      status,
      channelId,
      returnId,
      dateFrom,
      dateTo,
      sortOrder = 'asc',
      sortBy = '_id',
    } = query;

    const skip = (page - 1) * size;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const filter = {};

    // Build query filters
    if (status) {
      filter.status = { $regex: new RegExp(`^${status}$`, 'i') };
    }

    if (channelId) {
      filter.channelId = parseInt(channelId, 10);
    }

    if (returnId) {
      filter.returnId = returnId;
    }

    // Date filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};

      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo);
      }
    }

    const [totalReturns, returns] = await Promise.all([
      Return.countDocuments(filter),
      Return.find(filter)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
        .lean(),
    ]);

    return {
      data: returns,
      pagination: getPagination(totalReturns, page, size),
    };
  } catch (err) {
    console.error('Error fetching returns:', err.message);
    return { success: false, message: err.message };
  }
};

export default {
  getReturns,
  getReturnsFromDatabase,
  saveReturnToDatabase,
};
