import User from '#models/User.js';
import { formatErrorResponse } from '#util/responseFormatter.js';

export const getUserData = async (req, res) => {
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

export const userUpdate = async (req, res) => {
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

export const getAllUser = async (req, res) => {
  try {
    const { role, isActive } = req.query;
    const filter = {
      isDeleted: false,
    };
    if (role) {
      filter.role = role;
    }
    if (isActive) {
      filter.isActive = isActive;
    }
    const user = await User.find(filter);
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};
export const getUserId = async (req, res) => {
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

export const searchByName = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(200).json([]);
    }
    const searchgex = new RegExp(name, 'i');

    const user = await User.find({
      isDeleted: false,
      $or: [{ firstName: searchgex }, { lastName: searchgex }],
    });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(formatErrorResponse(err?.message || 'Failed to fetch user'));
  }
};
