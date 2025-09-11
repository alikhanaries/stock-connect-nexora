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

const user = express.Router();

user.get('/me', checkLanguage, authMiddleware, getUserById);
user.get('/', checkLanguage, authMiddleware, getAllUsers);
user.patch('/update-password', checkLanguage, authMiddleware, updatePassword);
user.delete('/all', checkLanguage, authMiddleware, deleteAllUsers);
user.delete('/bulk', checkLanguage, authMiddleware, deleteSelectedUsers);
user.patch('/update-status', checkLanguage, authMiddleware, updateSelectedUserStatus);
user.patch('/:id', checkLanguage, authMiddleware, updateUser);
user.get('/:id', checkLanguage, authMiddleware, getUserById);
user.delete('/:id', checkLanguage, authMiddleware, softDeleteUser);

export default user;
