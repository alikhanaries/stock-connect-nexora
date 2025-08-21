import Joi from 'joi';
import * as Responses from '../helpers/response.js';
import { errorLog } from '../middleware/errorLog.js';
const regularExpression = /^[0-9a-zA-Z .,:\n;%@&#!$^*+=`~()/_'"\\\-?|{}[\]]+$/;
// GET ALL CHANNELS FROM CHANEL
export const getAllChannelsFromChannelPartnerValidator = async (req, res, next) => {
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

// VIEW ALL CHANNELS VALIDATOR
export const getAllChannelsValidator = async (req, res, next) => {
  try {
    // const headerSchema = Joi.object({
    //   headers: Joi.object({
    //     authorization: Joi.required(),
    //   }).unknown(true),
    // });

    const bodySchema = Joi.object({
      searchKey: Joi.string().trim().pattern(regularExpression).messages({
        'string.pattern.base': `Wrong string format`,
      }),
    });
    const paramsSchema = Joi.object({
      limit: Joi.number().required(),
      page: Joi.number().required(),
      order: Joi.number().required(),
    });
    //  await headerSchema.validateAsync({ headers: req.headers });
    await paramsSchema.validateAsync(req.query);
    await bodySchema.validateAsync(req.body);
    next();
  } catch (error) {
    console.log(error);
    return Responses.errorResponse(req, res, error, 200);
  }
};
export default { getAllChannelsFromChannelPartnerValidator, getAllChannelsValidator };
