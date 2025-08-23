import channelService from '../service/channelService.js';
import Responses from '../helpers/response.js';

/**FUNC- FOR GET ALL CHANNEL LIST FROM CHANNEL PARTNER**/
export const getAllChannelsFromChannelPartner = async (req, res) => {
  try {
    const result = await channelService.getAllChannelsFromChannelPartner();
    if (!result.success) {
      return Responses.failResponse(res, 'Failed to retrieve channels', 404);
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
      return Responses.successResponse(res, 'No channels found', 404);
    }

    return Responses.successResponse(res, 'Channels found', 200, result);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};

/** FUNC - SAVE USER SELECTED CHANNEL IDS */
export const saveUserChannelData = async (req, res) => {
  try {
    const { userId, channelIds } = req.body;

    if (!userId || !Array.isArray(channelIds)) {
      return Responses.failResponse(res, 'userId and channelIds are required', 400);
    }

    // Call the service to save channel data
    const result = await channelService.saveUserChannelData(userId, channelIds);

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
export const getUserAllChannels = async (req, res) => {
  try {
    const result = await channelService.getUserAllChannels(req.params.userId);

    if (!result) {
      return Responses.successResponse(res, 'No channels found', 404);
    }

    return Responses.successResponse(res, 'User channels found', 200, result?.channelData);
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(res, error.message, 500);
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels, saveUserChannelData, getUserAllChannels };
