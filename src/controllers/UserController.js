import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';

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
    const { role, active, name, page, size = 10 } = req.query;

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
    if (name) {
      const searchRegex = new RegExp(name, 'i');
      filter.$or = [{ firstName: searchRegex }, { lastName: searchRegex }];
    }
    const [totalElements, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).skip(skip).limit(size).select(userSafeFields).lean(),
    ]);
    const response = {
      content: users,
      appliedFilters: {
        ...(active && { active: active }),
        ...(role && { role: role }),
      },
      page: pageNum,
      size: size,
      totalElements: totalElements,
      totalPages: Math.ceil(totalElements / size),
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
      return res.status(400).json(formatErrorResponse('Old and new passwords are required', 400));
    }
    if (oldPassword === newPassword) {
      return res.status(400).json(formatErrorResponse('New password must be different from the old password', 400));
    }

    const user = await User.findOne({ _id: userId, isDeleted: false }).select('+password');
    if (!user) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json(formatErrorResponse('Invalid old password', 400));
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json(formatSuccessResponse(null, 'Password updated successfully'));
  } catch (error) {
    return res.status(500).json(formatErrorResponse(error?.message || 'Failed to update password', 500));
  }
};
