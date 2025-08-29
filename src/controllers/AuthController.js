import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { generateTokenResponse, decodeToken, generateResetToken } from '#util/token.js';
import { errorHandler } from '#helpers/ErrorHandler.js';
import crypto from 'crypto';
import Response from '#helpers/response.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(formatErrorResponse('Missing credentials', 400));
    }

    const user = await User.findOne({ email, isDeleted: false, active: true }).select('+password');

    if (!user) {
      return res.status(400).json(formatErrorResponse('Invalid credentials', 400));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json(formatErrorResponse('Invalid credentials', 400));
    }

    // Create JWT payload
    const tokenResponse = generateTokenResponse(user, user.role);

    if (!tokenResponse) {
      return res.status(500).json(formatErrorResponse('Error generating token', 500));
    }

    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    res.json(formatSuccessResponse(tokenResponse, 'Login successful.'));
  } catch (error) {
    errorHandler(error, res);
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
    } = req.body;

    if (!email || !password || !firstName || !lastName || !role || !phoneNumber) {
      return Response.failResponse(res, 'Missing required fields', 400);
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return Response.failResponse(res, 'Email already exists', 409);
      }
      if (existingUser.phoneNumber === phoneNumber) {
        return Response.failResponse(res, 'Phone number already exists', 409);
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
    await newUser.save();

    return Response.successResponse(res, 'User Registerd successfully', 201);
  } catch (error) {
    return Response.errorResponse(res, error, 500);
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const decoded = decodeToken(refreshToken);

    if (!decoded || decoded.type !== 'refresh') {
      return res.status(400).json(formatErrorResponse('Invalid token', 400));
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isDeleted) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }

    const tokenResponse = generateTokenResponse(user, user.role);
    res.json(formatSuccessResponse(tokenResponse));
  } catch (error) {
    errorHandler(error, res);
  }
};
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json(formatErrorResponse('Missing inputs', 400));
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json(formatErrorResponse(`user not found with given ${email}`, 400));

    const { token, hashedToken } = generateResetToken();

    if (!token || !hashedToken) {
      return res.status(400).json(formatErrorResponse('unable to generate reset token', 400));
    }

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // In production, send `token` to user via email

    res.json(formatSuccessResponse({ token }));
  } catch (error) {
    errorHandler(error, res);
  }
};

export const validateResetToken = async (req, res) => {
  try {
    const { resetToken } = req.body;
    if (!resetToken) {
      return res.status(400).json(formatErrorResponse('require resetToken', 400));
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    res.json(formatSuccessResponse({ valid: !!user }));
  } catch (error) {
    errorHandler(error, res);
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json(formatErrorResponse('Missing inputs', 400));
    }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) res.status(400).json(formatErrorResponse('invalid or expired token', 400));
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json(formatSuccessResponse({}, 'password reset successful'));
  } catch (error) {
    errorHandler(error, res);
  }
};
