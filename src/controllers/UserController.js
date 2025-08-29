import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
import { getPagination } from '#helpers/PaginationHandler.js';
import Responses from '#helpers/response.js';
import userService from '#service/userService.js';

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
    const { id } = req.params;

    const { firstName, lastName, email, phoneNumber, active, role } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { firstName, lastName, email, phoneNumber, active, role },
      { new: true }
    ).select(userSafeFields);
    if (!updatedUser) {
      return Responses.failResponse(res, 'User not found', 404);
    }
    return Responses.successResponse(res, 'User updated successfully', 200, updatedUser.toObject());
  } catch (error) {
    return Responses.errorResponse(res, error);
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
        ...(active && { active: active === 'true' }),
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

export const updatePassword = async (req, res) => {
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

export const softDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUser = await userService.deleteUserId(id);

    if (!deletedUser) {
      return Responses.failResponse(res, 'User not found', 404);
    }
    return Responses.successResponse(res, 'User deleted successfully', 200);
  } catch (error) {
    return Responses.errorResponse(res, error);
  }
};

export const deleteAllUsers = async (req, res) => {
  try {
    const result = await userService.deleteAllUsers();
    if (!result.success) {
      return Responses.failResponse(res, 'Failed to delete users', 404);
    }
    return Responses.successResponse(res, 'All users have been deleted successfully.', 200);
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};

export const deleteSelectedUsers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Responses.failResponse(res, 'Please provide an array of user IDs.', 400);
    }
    const result = await userService.deleteSelectedUsers(ids);

    if (result.success === false) {
      return Responses.failResponse(res, result.message, 400);
    }

    return Responses.successResponse(res, `Successfully deleted ${result.modifiedCount} users.`, 200);
  } catch (error) {
    return Responses.errorResponse(res, error, 500);
  }
};
