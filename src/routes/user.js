import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUsers, getUserById, softDeleteUser, updateUser, updatePassword } from '#controllers/UserController.js';

const user = express.Router();

user.get('/me', authMiddleware, getUserById);
user.get('/', authMiddleware, getAllUsers);
user.patch('/update-password', authMiddleware, updatePassword);
user.patch('/:id', authMiddleware, updateUser);
user.get('/:id', authMiddleware, getUserById);
user.delete('/:id', authMiddleware, softDeleteUser);

export default user;
