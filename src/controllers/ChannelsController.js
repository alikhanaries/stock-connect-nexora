import { STATUS_MESSAGES, VALID_STATUSES } from '#constants/common.js';
import { errorLog } from '#middleware/index.js';
import Responses from '../helpers/response.js';
import channelService from '../service/channelService.js';
/**FUNC- FOR GET ALL CHANNEL LIST FROM CHANNEL PARTNER**/
export const getAllChannelsFromChannelPartner = async (req, res) => {
  try {
    const result = await channelService.getAllChannelsFromChannelPartner();
    if (!result.success) {
      return Responses.successResponse(res, req.locale.CHANNEL_FOUND_FAILED, 200);
    }
    return Responses.successResponse(res, req.locale.CHANNELS_SAVED_SUCCESSFULLY, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
/** FUNC - Get all channel list from DB */
export const getAllChannels = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { channels, pagination, appliedFilters } = await channelService.getAllChannels(req.query, sellerId);
    const responseData = {
      content: channels || [],
      appliedFilters: appliedFilters || {},
      ...(pagination || {}),
    };
    const message = channels && channels.length > 0 ? req.locale.CHANNELS_FOUND_SUCCESS : req.locale.NO_CHANNEL_FOUND;
    return Responses.successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

/** FUNC - SAVE USER SELECTED CHANNEL IDS */
export const saveUserChannels = async (req, res) => {
  try {
    const { ids } = req.body;
    const sellerId = req.sellerId;
    // Call the service to save channel data
    const result = await channelService.saveUserChannels(sellerId, ids);
    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale.CHANNEL_SAVE_FAILED, 500);
    }

    return Responses.successResponse(res, req.locale.CHANNEL_SAVED_SUCCESS, 200, result.data);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
/** FUNC - GET USER ALL CHANNEL LIST */
export const getAllUserChannels = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    // before listing (adds missing channels, ignores already-assigned ones)
    await channelService.autoAssignAllChannelsToSeller(sellerId);
    const { channelData, pagination, appliedFilters, success } = await channelService.getAllUserChannels(
      sellerId,
      req.query
    );

    const responseData = {
      content: channelData?.content || [],
      appliedFilters: appliedFilters || {},
      ...pagination,
    };
    // If no channels found
    if (!success || !channelData?.content?.length) {
      return Responses.successResponse(res, req.locale.NO_CHANNEL_FOUND, 200, responseData);
    }

    // Return found channels
    return Responses.successResponse(res, req.locale.USER_CHANNELS_FOUND, 200, responseData);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const updateUserChannelsStatus = async (req, res) => {
  try {
    const sellerId = req.sellerId;
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.INVALID_IDS, 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return Responses.failResponse(res, `${req.locale.STATUS_MUST_BE_ONE_OF} ${VALID_STATUSES.join(', ')}`, 400);
    }
    const updatedCount = await channelService.updateUserChannelsStatus(sellerId, ids, status);

    if (updatedCount === 0) {
      return Responses.failResponse(res, req.locale.NO_MATCHING_CHANNELS_FOUND_TO_UPDATE, 404);
    }
    return Responses.successResponse(res, `User channels ${STATUS_MESSAGES[status]} successfully`, 200);
  } catch (error) {
    console.error('Controller error in updateUserChannelsStatus:', error);
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const removeUserChannels = async (req, res) => {
  try {
    const { ids } = req.body;
    const sellerId = req.sellerId;
    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.INVALID_IDS, 400);
    }
    const updatedCount = await channelService.removeUserChannels(sellerId, ids);
    if (updatedCount === 0) {
      return Responses.failResponse(res, req.locale.NO_CHANNEL_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.USER_CHANNELS_REMOVED_SUCCESSFULLY, 200);
  } catch (error) {
    console.error('Controller error in removeUserChannels:', error);
    return Responses.errorResponse(res, error.message || 'Internal Server Error', 500);
  }
};

export const updateChannelSampleTemplate = async (req, res) => {
  try {
    const { channelId } = req.params;
    const { sampleTemplate } = req.body || {};
    const channelName = await channelService.updateSampleTemplate(channelId, sampleTemplate);
    if (!channelName) {
      return Responses.failResponse(res, req.locale?.NO_CHANNEL_FOUND || 'Channel not found', 404);
    }
    return Responses.successResponse(res, `sampleTemplate updated for ${channelName}`, 200);
  } catch (error) {
    errorLog(error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
  updateChannelSampleTemplate,
};
