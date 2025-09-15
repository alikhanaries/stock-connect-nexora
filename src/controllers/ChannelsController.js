import { STATUS_MESSAGES, VALID_STATUSES } from '#constants/common.js';
import Responses from '../helpers/response.js';
import User from '../models/User.js';
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
    return Responses.errorResponse(res, error.message, 500);
  }
};
/** FUNC - Get all channel list from DB */
export const getAllChannels = async (req, res) => {
  try {
    const { channels, pagination, appliedFilters } = await channelService.getAllChannels(req.query);
    const responseData = {
      content: channels || [],
      appliedFilters: appliedFilters || {},
      ...(pagination || {}),
    };
    const message = channels && channels.length > 0 ? req.locale.CHANNELS_FOUND_SUCCESS : req.locale.NO_CHANNEL_FOUND;
    return Responses.successResponse(res, message, 200, responseData);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};

/** FUNC - SAVE USER SELECTED CHANNEL IDS */
export const saveUserChannels = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user._id;
    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }

    // Call the service to save channel data
    const result = await channelService.saveUserChannels(userId, ids);

    if (!result.success) {
      return Responses.failResponse(res, result.message || req.locale.CHANNEL_SAVE_FAILED, 500);
    }

    return Responses.successResponse(res, req.locale.CHANNEL_SAVED_SUCCESS, 200, result.data);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};
/** FUNC - GET USER ALL CHANNEL LIST */
export const getAllUserChannels = async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure user exists
    const user = await User.findById(userId).lean();
    if (!user) {
      return Responses.failResponse(res, req.locale.USER_NOT_FOUND, 404);
    }

    const { channelData, pagination, appliedFilters, success } = await channelService.getAllUserChannels(
      userId,
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
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const updateUserChannelsStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.INVALID_IDS, 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return Responses.failResponse(res, `${req.locale.STATUS_MUST_BE_ONE_OF} ${VALID_STATUSES.join(', ')}`, 400);
    }
    const updatedCount = await channelService.updateUserChannelsStatus(userId, ids, status);

    if (updatedCount === 0) {
      return Responses.failResponse(res, req.locale.NO_MATCHING_CHANNELS_FOUND_TO_UPDATE, 404);
    }
    return Responses.successResponse(res, `User channels ${STATUS_MESSAGES[status]} successfully`, 200);
  } catch (error) {
    console.error('Controller error in updateUserChannelsStatus:', error);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const removeUserChannels = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { ids } = req.body;
    if (!userId) {
      return Responses.failResponse(res, req.locale.USERID_REQUIRED, 400);
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, req.locale.INVALID_IDS, 400);
    }
    const result = await channelService.removeUserChannels(userId, ids);
    if (result.deletedChannels === 0 && result.deletedProducts === 0) {
      return Responses.failResponse(res, req.locale.NO_CHANNEL_FOUND, 404);
    }
    return Responses.successResponse(res, req.locale.USER_CHANNELS_REMOVED_SUCCESSFULLY, 200);
  } catch (error) {
    console.error('Controller error in removeUserChannels:', error);
    return Responses.errorResponse(res, error.message || 'Internal Server Error', 500);
  }
};

export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
};
