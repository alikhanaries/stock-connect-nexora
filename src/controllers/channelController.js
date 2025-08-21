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
/** FUNC - Get all channel list from DB */
export const getAllChannels = async (req, res) => {
  try {
    const result = await channelService.getAllChannels(req.body, req.query);

    if (!result.success) {
      // if no channels found, return 200 with empty array
      if (result.message === messages.channelsNotFound) {
        return Responses.successResponse(req, res, { data: [], totalCount: 0 }, messages.channelsNotFound, 200);
      }
      // if actual error, return 500
      return Responses.errorResponse(req, res, result.message, 500);
    }

    // success response with filtered payload
    return Responses.successResponse(
      req,
      res,
      { data: result.data, totalCount: result.totalCount },
      messages.channelsFound,
      200
    );
  } catch (error) {
    console.error('Controller error:', error.message, error.stack);
    return Responses.errorResponse(req, res, error.message, 500);
  }
};

export default { getAllChannelsFromChannelPartner, getAllChannels };
