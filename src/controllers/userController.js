import User from '#models/User.js';
import { formatErrorResponse, formatSuccessResponse } from '#util/responseFormatter.js';
const userSafeFields = 'firstName lastName email phoneNumber role active createdAt updatedAt';
export const getUserById = async (req, res) => {
  try {
    const id = req.params.id || req.user._id;
    const user = await User.findById(id).select(userSafeFields);
    if (!user) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.status(200).json(formatSuccessResponse(user.toObject(), 'User fetched successfully'));
  } catch (err) {
    res.status(400).json(formatErrorResponse(err?.message || 'Failed to fetch user data'));
  }
};

export const updateUser = async (req, res) => {
  try {
    const id = req.user._id;
    const { firstName, lastName, email, phoneNumber } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { firstName, lastName, email, phoneNumber },
      { new: true }
    ).select('-isDeleted');
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
    const { role, active, name } = req.query;
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 10;
    const skip = (page - 1) * size;

    const filter = { isDeleted: false };
    if (role) {
      filter.role = role;
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
      User.find(filter).skip(skip).limit(size).select(userSafeFields),
    ]);
    const pages = Math.ceil(totalElements / size);
    const response = {
      content: users,
      appliedFilters: {
        ...(active && { active: active }),
        ...(role && { role: role }),
      },
      page: page,
      size: size,
      totalElements: totalElements,
      totalPages: pages,
      last: page >= pages,
      first: page === 1,
      success: true,
      status: 200,
    };
    res.status(200).json(formatSuccessResponse(response, 'User fetched successfully'));
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};
