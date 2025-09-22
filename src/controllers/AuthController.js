import User from '#models/User.js';
import { generateTokenResponse, decodeToken, generateResetToken } from '#util/token.js';
import { errorHandler } from '#helpers/ErrorHandler.js';
import { errorLog } from '#middleware/index.js';
import crypto from 'crypto';
import Response from '#helpers/response.js';
import userHelper from '#helpers/User.js';
import UserSeller from '#models/UserSeller.js';
import { USER_ROLES } from '#constants/common.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return Response.failResponse(res, 'Missing credentials', 400);
    }

    const user = await User.findOne({ email, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return Response.failResponse(res, 'No account exists with this email. Please register to continue.', 400);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return Response.failResponse(res, 'Invalid credentials', 400);
    }

    let sellerId = null;

    if (user.role !== USER_ROLES.MASTER_ADMIN) {
      sellerId = await userHelper.getSellerId(user._id);
    }
    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role, sellerId);

    if (!tokenResponse) {
      return Response.failResponse(res, 'Error generating token', 500);
    }
    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    return Response.successResponse(res, 'Login successful', 200, tokenResponse);
  } catch (error) {
    console.error('userLogin Error:', error);
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
    if (role != USER_ROLES.MASTER_ADMIN && !sellerId) {
      return Response.failResponse(res, 'A sellerId is required for this user role.', 400);
    }
    const seller = await userHelper.validateSellerAccessForCreator(creatorId, sellerId, creatorRole);
    const massage =
      seller.role === USER_ROLES.MASTER_ADMIN
        ? 'the Seller you have provided does not exists.'
        : 'You do not have access to this seller.';
    if (!seller.success) {
      return Response.failResponse(res, massage, 403);
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

    if (role !== USER_ROLES.MASTER_ADMIN) {
      const userSellerConnection = new UserSeller({
        userId: newUserData._id,
        sellerId: sellerId,
      });
      await userSellerConnection.save();
    }

    return Response.successResponse(res, 'User Registered successfully', 201);
  } catch (error) {
    errorLog(error);
    return Response.errorResponse(res, error, 500);
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

    // In production, send `token` to user via email
    return Response.successResponse(res, 'email varification successful', 200, { token });
  } catch (error) {
    console.error('Forget password error', error);
    errorLog(error);
    return Response.errorResponse(res, error, 500);
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
