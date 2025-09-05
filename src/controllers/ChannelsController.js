import channelService from '../service/channelService.js';
import Responses from '../helpers/response.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { STATUS_MESSAGES, VALID_STATUSES } from '#constants/common.js';
// Access ObjectId from mongoose
const ObjectId = mongoose.Types.ObjectId;
/**FUNC- FOR GET ALL CHANNEL LIST FROM CHANNEL PARTNER**/
export const getAllChannelsFromChannelPartner = async (req, res) => {
  try {
    const result = await channelService.getAllChannelsFromChannelPartner();
    if (!result.success) {
      return Responses.successResponse(res, 'Failed to retrieve channels', 200);
    }
    return Responses.successResponse(res, 'Channels saved successfully', 200);
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};
/** FUNC - Get all channel list from DB */
export const getAllChannels = async (req, res) => {
  try {
    const result = await channelService.getAllChannels();
    if (!result) {
      return Responses.successResponse(res, req.locale.NO_CHANNEL_FOUND, 200);
    }
    return Responses.successResponse(res, req.locale.CHANNELS_FOUND_SUCCESS, 200, result);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};

/** FUNC - SAVE USER SELECTED CHANNEL IDS */
export const saveUserChannels = async (req, res) => {
  try {
    const { userId, channelIds } = req.body;

    if (!userId || !Array.isArray(channelIds)) {
      return Responses.failResponse(res, 'userId and channelIds are required', 400);
    }
    // Validate ObjectId format
    if (!ObjectId.isValid(userId)) {
      return Responses.failResponse(res, 'Invalid userId format', 400);
    }
    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return Responses.failResponse(res, 'User not found', 404);
    }

    // Call the service to save channel data
    const result = await channelService.saveUserChannels(userId, channelIds);

    if (!result.success) {
      return Responses.failResponse(res, result.message || 'Failed to save channels', 500);
    }

    return Responses.successResponse(res, 'Channels saved successfully', 200, result.data);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};
/** FUNC - GET USER ALL CHANNEL LIST */
export const getAllUserChannels = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId format
    if (!ObjectId.isValid(userId)) {
      return Responses.failResponse(res, 'Invalid userId format', 400);
    }
    // Ensure user exists
    const user = await User.findById(userId);
    if (!user) {
      return Responses.failResponse(res, 'User not found', 404);
    }

    const result = await channelService.getAllUserChannels(userId);

    if (!result.success) {
      return Responses.successResponse(res, 'No channels found', 200, []);
    }

    return Responses.successResponse(res, 'User channels found', 200, result?.channelData);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export const updateUserChannelsStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelIds, status } = req.body;
    if (!Array.isArray(channelIds) || channelIds.length === 0 || channelIds.some((id) => !ObjectId.isValid(id))) {
      return Responses.failResponse(res, 'One or more channelIds are invalid', 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return Responses.failResponse(res, 'status must be one of active, deactive, or removed', 400);
    }
    const updatedCount = await channelService.updateUserChannelsStatus(userId, channelIds, status);

    if (updatedCount === 0) {
      return Responses.failResponse(res, 'No matching channels found to update', 404);
    }
    return Responses.successResponse(res, `User channels ${STATUS_MESSAGES[status]} successfully`, 200);
  } catch (error) {
    console.error('Controller error in updateUserChannelsStatus:', error);
    return Responses.errorResponse(res, error.message, 500);
  }
};
export default {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
};
