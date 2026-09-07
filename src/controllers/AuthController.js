import User from '#models/User.js';
import { generateTokenResponse, decodeToken, generateResetToken } from '#util/token.js';
import { errorHandler } from '#helpers/ErrorHandler.js';
import { errorLog, isLoginFailureLockedOut, recordLoginFailure, clearLoginFailures } from '#middleware/index.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Response from '#helpers/response.js';
import userHelper from '#helpers/User.js';
import { USER_ROLES } from '#constants/common.js';
import emailService from '#service/emailService.js';
import { config } from '#config/config.js';

// Pre-generated bcrypt hash (cost factor 10) for timing equalization when no user exists.
const DUMMY_BCRYPT_HASH = '$2b$10$sngBkeoc/opXt5Xfc2O8ueQwhN1bh31a/RFft/QcvNdkm10cg7VeS';

export const login = async (req, res) => {
  try {
    if (await isLoginFailureLockedOut(req, res)) {
      return;
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return Response.failResponse(res, req.locale.MISSING_CREDENTIALS, 400);
    }

    const user = await User.findOne({ email, isDeleted: false, active: true }).select('+password');

    const isMatch = user ? await user.comparePassword(password) : await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

    if (!user || !isMatch) {
      await recordLoginFailure(req);
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

    await clearLoginFailures(req);

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
      sellerIds,
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
    if (role !== USER_ROLES.MASTER_ADMIN && (!Array.isArray(sellerIds) || sellerIds.length === 0)) {
      return Response.failResponse(res, 'Atleast one seller id is required for this user role.', 400);
    }
    if (role !== USER_ROLES.MASTER_ADMIN) {
      for (const sellerId of sellerIds) {
        const seller = await userHelper.validateSellerAccessForCreator(creatorId, sellerId, creatorRole, role);
        if (seller && !seller.success) {
          if (!seller.notBaseSeller) {
            return Response.failResponse(res, 'You cannot assign the base seller to any user.', 400);
          }
          const message =
            seller.role === USER_ROLES.MASTER_ADMIN
              ? `The seller you have provided (${sellerId}) does not exist.`
              : `You do not have access to this seller (${sellerId}).`;
          return Response.failResponse(res, message, 403);
        }
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

    await userHelper.userAndSellerConnection(role, sellerIds, newUserData._id);

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

    const userTokenVersion = user.tokenVersion || 0;
    const decodedTokenVersion = decoded.tokenVersion ?? 0;
    if (userTokenVersion !== decodedTokenVersion) {
      return Response.failResponse(res, req.locale.INVALID_TOKEN, 401);
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);
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
      return Response.successResponse(res, req.locale.EMAIL_VERIFICATION_SUCCESS, 200);
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
      console.error('Reset email failed for', email, mailResult.error);
      return Response.successResponse(res, req.locale.EMAIL_VERIFICATION_SUCCESS, 200);
    }
    return Response.successResponse(res, req.locale.EMAIL_VERIFICATION_SUCCESS, 200);
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
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    return Response.successResponse(res, req.locale.PASSWORD_RESET_SUCCESS, 200);
  } catch (error) {
    console.error('reset-password error', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
  }
};
