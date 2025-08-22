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
    return Responses.errorResponse(res, error);
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
    return Responses.errorResponse(req, res, error.message, 500);
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels };
