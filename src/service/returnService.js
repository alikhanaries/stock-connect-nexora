import { config } from '#config/config.js';
import Return from '#models/Return.js';
import { sanitizeReturnData, validateReturnData } from '#helpers/ReturnHandler.js';
import { getPagination } from '#helpers/PaginationHandler.js';

const { CHANNEL_ENGINE_BASE_URL, CHANNEL_ENGINE_API_KEY } = config;

/**
 * Fetches returns from ChannelEngine and saves them to the database.
 */
export const getReturns = async (queryParams = {}) => {
  try {
    const params = new URLSearchParams({
      ...queryParams,
      apikey: `${CHANNEL_ENGINE_API_KEY}`,
    });
    const fullUrl = `${CHANNEL_ENGINE_BASE_URL}returns?${params.toString()}`;

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
 * Saves return data to the database with simplified structure.
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
 * Gets returns from the database with pagination and filtering.
 */
export const getReturnsFromDatabase = async (query = {}) => {
  try {
    const { status, channelId, returnId, dateFrom, dateTo, sortOrder = 'asc', sortBy = '_id' } = query;

    const page = parseInt(query.page, 10) || 1;
    const size = parseInt(query.size, 10) || 10;

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

    const projection = {
      name: 1,
      orderId: 1,
      phone: 1,
      placedOn: 1,
      platform: 1,
      products: 1,
      status: 1,
    };

    const [totalReturns, returns] = await Promise.all([
      Return.countDocuments(filter),
      // Add the projection object as the second argument to find()
      Return.find(filter, projection)
        .skip(skip)
        .limit(size)
        .sort({ [sortBy]: sortDirection })
        .lean(),
    ]);

    return {
      success: true,
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
