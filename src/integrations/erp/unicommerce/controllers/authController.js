import User from '#models/User.js';
import { generateTokenResponse } from '#util/token.js';
import { errorLog } from '#middleware/index.js';
import userHelper from '#helpers/User.js';
import {
  successResponse,
  failResponse,
  errorResponse,
} from '#root/src/integrations/erp/unicommerce/helpers/response.js';

export const login = async (req, res) => {
  try {
    const username = req.body?.username ?? req.query?.username;
    const password = req.body?.password ?? req.query?.password;

    if (!username || !password) {
      return failResponse(res, 400, { message: req.locale.MISSING_CREDENTIALS });
    }

    const user = await User.findOne({ email: username, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return failResponse(res, 404, { message: req.locale.NO_ACCOUNT });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return failResponse(res, 401, { message: req.locale.INVALID_CREDENTIALS });
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    if (sellerIds.length === 0) {
      return failResponse(res, 400, { message: req.locale.NO_SELLER_CONNECTED });
    }

    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);

    if (!tokenResponse) {
      return errorResponse(res, 500, { message: req.locale.TOKEN_ERROR });
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return successResponse(res, 200, {
      status: 'SUCCESS',
      accessToken: tokenResponse.token,
    });
  } catch (error) {
    console.error('user login Error:', error);
    errorLog(error);
    return errorResponse(res, error.statusCode || 500, { message: error.message });
  }
};
