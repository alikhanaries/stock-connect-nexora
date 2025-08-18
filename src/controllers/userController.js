import User from '#models/User.js';
import { formatErrorResponse } from '#util/responseFormatter.js';

export const getUser = async (req, res) => {
  try {
    const id = req.user._id;
    const newUser = await User.findById(id).select('-isDeleted');
    if (!newUser) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.json(newUser);
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
    res.status(200).json({
      success: true,
      message: 'Opration successfully',
      data: updatedUser,
    });
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
      filter.active = active;
    }
    if (name) {
      const searchRegex = new RegExp(name, 'i');
      filter.$or = [{ firstName: searchRegex }, { lastName: searchRegex }];
    }

    const totalElements = await User.countDocuments(filter);
    const users = await User.find(filter).skip(skip).limit(size);
    const response = {
      content: users,
      appliedFilters: {
        ...(active && { active: active }),
        ...(role && { type: role }),
      },
      page: page,
      size: size,
      totalElements: totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: page >= Math.ceil(totalElements / size),
      first: page === 1,
      success: true,
      status: 200,
    };

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await User.findById(id);
    if (!data) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};
