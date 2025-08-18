import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUsers, getUserById, updateUser } from '#controllers/userController.js';

const user = express.Router();

user.get('/me', authMiddleware, getUserById);
user.patch('/me', authMiddleware, updateUser);
user.get('/', getAllUsers);
user.get('/:id', getUserById);

export default user;
