import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { generateTokenResponse, decodeToken } from '#util/token.js';
import { errorHandler } from '#helpers/ErrorHandler.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json(formatErrorResponse('Missing credentials', 400));
    }

    const user = await User.findOne({ email, isDeleted: false }).select('+password');

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
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json(formatErrorResponse('Missing inputs', 400));
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json(formatErrorResponse('Email already exists', 400));
    }

    const newUser = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      isSupplierConnected: false,
    });

    await newUser.save();

    // Generate JWT token
    const tokenResponse = generateTokenResponse(newUser, newUser.role);

    if (!tokenResponse) {
      return res.status(500).json(formatErrorResponse('Error generating token', 500));
    }

    // Respond with the success response and JWT token
    res.status(201).json(formatSuccessResponse(tokenResponse, 'Registration successful.'));
  } catch (error) {
    errorHandler(error, res);
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
