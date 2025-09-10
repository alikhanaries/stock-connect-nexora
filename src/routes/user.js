import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import {
  getAllUsers,
  getUserById,
  softDeleteUser,
  updateUser,
  updatePassword,
  deleteAllUsers,
  deleteSelectedUsers,
  updateSelectedUserStatus,
} from '#controllers/UserController.js';
import {
  bulkDeleteUsersValidator,
  getAllUsersValidator,
  userIdValidator,
  updatePasswordValidator,
  updateSelectedUserStatusValidator,
  updateUserValidator,
} from '#validations/users.js';

const user = express.Router();

user.get('/me', authMiddleware, getUserById);
user.get('/', getAllUsersValidator, authMiddleware, getAllUsers);
user.patch('/update-password', updatePasswordValidator, authMiddleware, updatePassword);
user.delete('/all', authMiddleware, deleteAllUsers);
user.delete('/bulk', bulkDeleteUsersValidator, authMiddleware, deleteSelectedUsers);
user.patch('/update-status', updateSelectedUserStatusValidator, authMiddleware, updateSelectedUserStatus);
user.patch('/:id', updateUserValidator, authMiddleware, updateUser);
user.get('/:id', userIdValidator, authMiddleware, getUserById);
user.delete('/:id', userIdValidator, authMiddleware, softDeleteUser);

export default user;
