import channelService from '../service/channelService.js';
import Responses from '../helpers/response.js';
import messages from '../constants/constantMessages.js';
import { errorLog } from '../middleware/errorLog.js';

/**FUNC- FOR GET ALL CHANNEL LIST FROM CHANNEL PARTNER**/
export const getAllChannelsFromChannelPartner = async (req, res) => {
  try {
    const result = await channelService.getAllChannelsFromChannelPartner();
    if (!result.success) {
      return Responses.failResponse(req, res, null, result?.message, 200);
    }
    return Responses.successResponse(req, res, null, messages.channelsAddedSuccessfully, 200);
  } catch (error) {
    console.log(error);
    errorLog(error);
    return Responses.errorResponse(req, res, error);
  }
};

export default { getAllChannelsFromChannelPartner };
