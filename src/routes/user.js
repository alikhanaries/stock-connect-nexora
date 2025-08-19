import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUsers, getUserById, updateUser } from '#controllers/UserController.js';

const user = express.Router();

user.get('/me', authMiddleware, getUserById);
user.patch('/me', authMiddleware, updateUser);
user.get('/', authMiddleware, getAllUsers);
user.get('/:id', authMiddleware, getUserById);

export default user;
