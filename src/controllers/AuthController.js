import User from '#models/User.js';
import { generateTokenResponse, decodeToken, generateResetToken } from '#util/token.js';
import { errorHandler } from '#helpers/ErrorHandler.js';
import { errorLog } from '#middleware/index.js';
import crypto from 'crypto';
import Response from '#helpers/response.js';
import userHelper from '#helpers/User.js';
import { USER_ROLES } from '#constants/common.js';
import emailService from '#service/emailService.js';
import { config } from '#config/config.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return Response.failResponse(res, req.locale.MISSING_CREDENTIALS, 400);
    }

    const user = await User.findOne({ email, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return Response.failResponse(res, req.locale.NO_ACCOUNT, 404);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return Response.failResponse(res, req.locale.INVALID_CREDENTIALS, 401);
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    if (sellerIds.length === 0) {
      return Response.failResponse(res, req.locale.NO_SELLER_CONNECTED, 400);
    }
    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);

    if (!tokenResponse) {
      return Response.failResponse(res, req.locale.TOKEN_ERROR, 500);
    }
    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return Response.successResponse(res, req.locale.LOGIN_SUCCESS, 200, tokenResponse);
  } catch (error) {
    console.error('user login Error:', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
  }
};

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      phoneNumber,
      active,
      isMarketplaceConnected = false,
      sellerId,
    } = req.body;
    const creatorRole = req.user.role;
    const creatorId = req.user._id;

    if (!userHelper.userRoleBasedAccess(creatorRole, role)) {
      return Response.failResponse(res, req.locale.NO_PERMISSION_CREATE_ROLE, 403);
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }],
    });

    if (existingUser) {
      return Response.failResponse(res, req.locale.USER_ALREADY_EXISTS, 409);
    }
    if (role !== USER_ROLES.MASTER_ADMIN && !sellerId) {
      return Response.failResponse(res, req.locale.SELLER_ID_REQUIRED, 400);
    }
    if (role !== USER_ROLES.MASTER_ADMIN) {
      const seller = await userHelper.validateSellerAccessForCreator(creatorId, sellerId, creatorRole, role);

      if (seller && !seller.success) {
        if (!seller.notBaseSeller) {
          return Response.failResponse(res, req.locale.CANNOT_ASSIGN_BASE_SELLER, 400);
        }
        const message =
          seller.role === USER_ROLES.MASTER_ADMIN ? req.locale.SELLER_NOT_EXIST : req.locale.NO_ACCESS_TO_SELLER;
        return Response.failResponse(res, message, 403);
      }
    }

    const newUser = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      isMarketplaceConnected,
      phoneNumber,
      active,
    });
    const newUserData = await newUser.save();

    if (!newUserData) {
      return Response.failResponse(res, req.locale.USER_REGISTER_ERROR, 400);
    }

    await userHelper.userAndSellerConnection(role, sellerId, newUserData._id);

    return Response.successResponse(res, req.locale.USER_REGISTER_SUCCESS, 201);
  } catch (error) {
    console.error('User register ...', error.message);
    errorLog(error);
    return Response.errorResponse(res, error.message, 500);
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const decoded = decodeToken(refreshToken);

    if (!decoded || decoded.type !== 'refresh') {
      return Response.failResponse(res, req.locale.INVALID_TOKEN, 400);
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isDeleted) {
      return Response.failResponse(res, req.locale.USER_NOT_FOUND_WITH_THE_DETAILS, 404);
    }

    const tokenResponse = generateTokenResponse(user, user.role);
    return Response.successResponse(res, req.locale.REFRESH_TOKEN, 200, tokenResponse);
  } catch (error) {
    errorLog(error);
    errorHandler(error, res);
  }
};
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return Response.failResponse(res, req.locale.MISSING_EMAIL, 400);
    }
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return Response.failResponse(res, `${req.locale.USER_NOT_FOUND_WITH_GIVEN} ${email}`, 400);
    }

    const { token, hashedToken } = generateResetToken();

    if (!token || !hashedToken) {
      return Response.failResponse(res, req.locale.RESET_TOKEN_ERROR, 400);
    }

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // Send reset password email
    const resetUrl = `${config.FRONTEND_URL}/account/reset-password?resetToken=${token}`;

    const mailResult = await emailService.resetPasswordService({
      to: email,
      userName: user.firstName || 'User',
      resetUrl,
    });

    if (!mailResult.success) {
      return Response.failResponse(res, req.locale.RESET_EMAIL_FAILED, 500);
    }
    return Response.successResponse(res, req.locale.EMAIL_VERIFICATION_SUCCESS, 200, { token });
  } catch (error) {
    console.error('Forget password error', error);
    errorLog(error);
    return Response.errorResponse(res, error.message, 500);
  }
};

export const validateResetToken = async (req, res) => {
  try {
    const { resetToken } = req.body;
    if (!resetToken) {
      return Response.failResponse(res, req.locale.VALID_RESET_TOKEN_REQUIRED, 400);
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    return Response.successResponse(res, req.locale.RESET_TOKEN_GENERATION_SUCCESS, 200, { valid: !!user });
  } catch (error) {
    console.error('reset-token generation error', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return Response.failResponse(res, req.locale.MISSING_INPUTS, 400);
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return Response.failResponse(res, req.locale.INVALID_OR_EXPIRED_TOKEN, 400);
    }
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return Response.successResponse(res, req.locale.PASSWORD_RESET_SUCCESS, 200);
  } catch (error) {
    console.error('reset-password error', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
  }
};
