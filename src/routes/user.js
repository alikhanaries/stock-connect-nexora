import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUsers, getUser, getUserById, updateUser } from '#controllers/userController.js';

const user = express.Router();

user.get('/', authMiddleware, getUser);
user.patch('/update', authMiddleware, updateUser);
user.get('/all', authMiddleware, getAllUsers);
user.get('/:id', getUserById);

export default user;
