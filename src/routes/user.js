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
import { sellerMiddelware } from '#middleware/sellerMiddleware.js';

const user = express.Router();

user.get('/me', checkLanguage, authMiddleware, getUserById);
user.get('/', getAllUsersValidator, checkLanguage, authMiddleware, sellerMiddelware, getAllUsers);
user.patch('/update-password', updatePasswordValidator, checkLanguage, authMiddleware, updatePassword);
user.delete('/all', checkLanguage, authMiddleware, deleteAllUsers);
user.delete('/bulk', bulkDeleteUsersValidator, checkLanguage, authMiddleware, deleteSelectedUsers);
user.patch(
  '/update-status',
  updateSelectedUserStatusValidator,
  checkLanguage,
  authMiddleware,
  updateSelectedUserStatus
);
user.patch('/:id', updateUserValidator, checkLanguage, authMiddleware, updateUser);
user.get('/:id', userIdValidator, checkLanguage, authMiddleware, getUserById);
user.delete('/:id', userIdValidator, checkLanguage, authMiddleware, softDeleteUser);

export default user;
