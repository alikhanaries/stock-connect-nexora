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
      return Response.failResponse(res, 'Missing credentials', 400);
    }

    const user = await User.findOne({ email, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return Response.failResponse(res, 'No account exists with this email. Please register to continue.', 404);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return Response.failResponse(res, 'Invalid credentials', 401);
    }

    const sellerIds = (await userHelper.getSellerIds(user._id.toString())) || [];
    if (sellerIds.length === 0) {
      return Response.failResponse(
        res,
        'You are not connected to any seller. Please connect with a seller to continue.',
        400
      );
    }
    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role, sellerIds);

    if (!tokenResponse) {
      return Response.failResponse(res, 'Error generating token', 500);
    }
    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return Response.successResponse(res, 'Login successful', 200, tokenResponse);
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
      return Response.failResponse(res, 'You do not have permission to create this user role', 403);
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }],
    });

    if (existingUser) {
      return Response.failResponse(res, 'A user with this email or phone number already exists.', 409);
    }
    if (role !== USER_ROLES.MASTER_ADMIN && !sellerId) {
      return Response.failResponse(res, 'A sellerId is required for this user role.', 400);
    }
    if (role !== USER_ROLES.MASTER_ADMIN) {
      const seller = await userHelper.validateSellerAccessForCreator(creatorId, sellerId, creatorRole);

      if (seller && !seller.success) {
        if (!seller.notBaseSeller) {
          return Response.failResponse(res, 'You cannot assign the base seller to any user.', 400);
        }
        const message =
          seller.role === USER_ROLES.MASTER_ADMIN
            ? 'The seller you have provided does not exist.'
            : 'You do not have access to this seller.';
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
      return Response.failResponse(res, 'There is a issue while registring the user please try again', 400);
    }

    await userHelper.userAndSellerConnection(role, sellerId, newUserData._id);

    return Response.successResponse(res, 'User Registered successfully', 201);
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
      return Response.failResponse(res, 'Invalid token', 400);
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isDeleted) {
      return Response.failResponse(res, "We couldn't find a user with the provided details.", 404);
    }

    const tokenResponse = generateTokenResponse(user, user.role);
    return Response.successResponse(res, 'refresh token', 200, tokenResponse);
  } catch (error) {
    errorLog(error);
    errorHandler(error, res);
  }
};
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return Response.failResponse(res, 'Missing email', 400);
    }
    const user = await User.findOne({ email });
    if (!user) {
      return Response.failResponse(res, `user not found with given ${email}`, 400);
    }

    const { token, hashedToken } = generateResetToken();

    if (!token || !hashedToken) {
      return Response.failResponse(res, 'unable to generate reset token', 400);
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
      return Response.failResponse(res, 'Failed to send reset email', 500);
    }
    return Response.successResponse(res, 'email varification successful', 200, { token });
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
      return Response.failResponse(res, 'A valid reset token is required to proceed.', 400);
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    return Response.successResponse(res, 'reset-token generation successful', 200, { valid: !!user });
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
      return Response.failResponse(res, 'Missing inputs', 400);
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return Response.failResponse(res, 'invalid or expired token', 400);
    }
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return Response.successResponse(res, 'password reset successful', 200);
  } catch (error) {
    console.error('reset-password error', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
  }
};
