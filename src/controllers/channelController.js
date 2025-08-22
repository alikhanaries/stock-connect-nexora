import channelService from '../service/channelService.js';
import Responses from '../helpers/response.js';

/**FUNC- FOR GET ALL CHANNEL LIST FROM CHANNEL PARTNER**/
export const getAllChannelsFromChannelPartner = async (req, res) => {
  try {
    const result = await channelService.getAllChannelsFromChannelPartner();
    if (!result.success) {
      return Responses.failResponse(req, res, null, result?.message, 200);
    }
    return Responses.successResponse(req, res, null, 'Channels added successfully', 200);
  } catch (error) {
    return Responses.errorResponse(req, res, error);
  }
};

export default { getAllChannelsFromChannelPartner };
