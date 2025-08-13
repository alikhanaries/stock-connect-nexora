import User from '#models/User.js';
import { formatErrorResponse } from '#util/responseFormatter.js';

export const userData = async (req, res) => {
  try {
    console.log(req.user);
    const id = req.user._id;
    const newUser = await User.findById(id);
    if (!newUser) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    if (newUser.isDeleted == true) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    const response = newUser.toObject();
    delete response.isDeleted;
    res.json(response);
  } catch (err) {
    res.status(400).json(formatErrorResponse(err?.message || 'Failed to fetch user data'));
  }
};

export const userUpdate = async (req, res) => {
  try {
    const id = req.user._id;
    const { firstName, lastName, role, email, isActive } = req.body;

    const updatedUser = await User.findByIdAndUpdate(id, { firstName, lastName, role, email, isActive }, { new: true });
    if (!updatedUser) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }

    if (updatedUser.isDeleted == true) {
      return res.status(404).json(formatErrorResponse('User not found', 404));
    }
    const response = updatedUser.toObject();
    delete response.isDeleted;

    res.status(201).json({
      success: true,
      message: 'Opration successfully',
      data: response,
    });
  } catch (err) {
    res.status(400).json(formatErrorResponse(err?.message || 'Failed to update user'));
  }
};
