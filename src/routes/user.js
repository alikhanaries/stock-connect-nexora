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
} from '#controllers/UserController.js';

const user = express.Router();

user.get('/me', authMiddleware, getUserById);
user.get('/', authMiddleware, getAllUsers);
user.patch('/update-password', authMiddleware, updatePassword);
user.delete('/all', authMiddleware, deleteAllUsers);
user.delete('/bulk', authMiddleware, deleteSelectedUsers);
user.patch('/:id', authMiddleware, updateUser);
user.get('/:id', authMiddleware, getUserById);
user.delete('/:id', authMiddleware, softDeleteUser);

export default user;
