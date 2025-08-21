import Joi from 'joi';
import * as Responses from '../helpers/response.js';
import { errorLog } from '../middleware/errorLog.js';

// GET ALL CHANNELS FROM CHANEL
export const getAllChannelsFromChannelPartner = async (req, res, next) => {
  try {
   const headerSchema = Joi.object({
      headers: Joi.object({
        authorization: Joi.required(),
      }).unknown(true),
    });
    await headerSchema.validateAsync({ headers: req.headers });
    next();
  } catch (error) {
    console.log(error);
    errorLog(error);
    return Responses.errorResponse(req, res, error, 400);
  }
};

