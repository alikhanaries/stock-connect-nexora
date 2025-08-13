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
    const { firstName, lastName, email } = req.body;

    const updatedUser = await User.findByIdAndUpdate(id, { firstName, lastName, email }, { new: true }).select(
      '-isDeleted'
    );
    if (!updatedUser) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    res.status(201).json({
      success: true,
      message: 'Opration successfully',
      data: updatedUser,
    });
  } catch (err) {
    res.status(400).json(formatErrorResponse(err?.message || 'Failed to update user'));
  }
};
