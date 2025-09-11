import express from 'express';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
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

user.get('/me', checkLanguage, authMiddleware, getUserById);
user.get('/', checkLanguage, getAllUsersValidator, authMiddleware, getAllUsers);
user.patch('/update-password', checkLanguage, updatePasswordValidator, authMiddleware, updatePassword);
user.delete('/all', checkLanguage, authMiddleware, deleteAllUsers);
user.delete('/bulk', checkLanguage, bulkDeleteUsersValidator, authMiddleware, deleteSelectedUsers);
user.patch('/update-status', checkLanguage, updateSelectedUserStatusValidator, authMiddleware, updateSelectedUserStatus);
user.patch('/:id', checkLanguage, updateUserValidator, authMiddleware, updateUser);
user.get('/:id', checkLanguage, userIdValidator, authMiddleware, getUserById);
user.delete('/:id', checkLanguage, userIdValidator, authMiddleware, softDeleteUser);


export default user;
