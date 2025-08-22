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

export default { getAllChannelsFromChannelPartner };
