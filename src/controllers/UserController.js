import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import Responses from '#helpers/response.js';
const userSafeFields = 'firstName lastName email phoneNumber role active createdAt updatedAt';

export const getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user?._id;
    const user = await User.findOne({ _id: id, isDeleted: false }).select(userSafeFields).lean();
    if (!user) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.status(200).json(formatSuccessResponse(user, 'User fetched successfully'));
  } catch (err) {
    res.status(400).json(formatErrorResponse(err?.message || 'Failed to fetch user data'));
  }
};

export const updateUser = async (req, res) => {
  try {
    const id = req.user._id;
    const { firstName, lastName, email, phoneNumber, active } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { firstName, lastName, email, phoneNumber, active },
      { new: true }
    ).select(userSafeFields);
    if (!updatedUser) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.status(200).json(formatSuccessResponse(updatedUser.toObject(), 'User updated successfully'));
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to update user'));
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role, active, search, page, size = 10 } = req.query;

    const pageNum = parseInt(page);
    const limit = parseInt(size);

    const skip = (pageNum - 1) * limit;

    const filter = { isDeleted: false };
    if (role) {
      filter.role = role.toLowerCase();
    }
    if (active) {
      if (active === 'true' || active === 'false') {
        filter.active = active === 'true';
      }
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [{ firstName: searchRegex }, { lastName: searchRegex }];
    }
    const [totalElements, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).skip(skip).limit(size).select(userSafeFields).lean(),
    ]);
    const pagination = getPagination(totalElements, pageNum, limit);
    const response = {
      content: users,
      appliedFilters: {
        ...(active && { active: active }),
        ...(role && { role: role }),
      },
      ...pagination,
      success: true,
      status: 200,
    };
    res.status(200).json(formatSuccessResponse(response, 'User fetched successfully'));
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};

export const userUpdatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?._id;

    if (!oldPassword || !newPassword) {
      return Responses.failResponse(res, 'Old and new passwords are required', 400);
    }
    if (oldPassword === newPassword) {
      return Responses.failResponse(res, 'New password must be different from the old password', 400);
    }

    const user = await User.findOne({ _id: userId, isDeleted: false }).select('+password');
    if (!user) {
      return Responses.failResponse(res, 'User not found', 404);
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return Responses.failResponse(res, 'Invalid old password', 400);
    }
    user.password = newPassword;
    await user.save();

    return Responses.successResponse(res, 'Password updated successfully', 200);
  } catch (error) {
    console.error('userUpdatePassword Error:', error);
    return Responses.errorResponse(res, error, 500);
  }
};
