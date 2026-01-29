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
    const { username, password } = req.body;

    if (!username || !password) {
      failResponse(res, 400, { message: req.locale.MISSING_CREDENTIALS });
    }

    const user = await User.findOne({ email: username, isDeleted: false, active: true }).select('+password');

    if (!user) {
      failResponse(res, 404, { message: req.locale.NO_ACCOUNT });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      failResponse(res, 401, { message: req.locale.INVALID_CREDENTIALS });
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    if (sellerIds.length === 0) {
      failResponse(res, 400, { message: req.locale.NO_SELLER_CONNECTED });
    }
    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);

    if (!tokenResponse) {
      errorResponse(res, 500, { message: req.locale.TOKEN_ERROR });
    }
    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    successResponse(res, 200, {
      status: 'SUCCESS',
      accessToken: tokenResponse.token,
      sellerId: tokenResponse.sellerIds?.[0],
    });
  } catch (error) {
    console.error('user login Error:', error);
    errorLog(error);
    errorResponse(res, error.statusCode || 500, { message: error.message });
  }
};
