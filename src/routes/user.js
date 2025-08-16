import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUser, getUserData, getUserId, userUpdate } from '#controllers/userController.js';

const user = express.Router();

user.get('/', authMiddleware, getUserData);
user.patch('/update', authMiddleware, userUpdate);
user.get('/all', authMiddleware, getAllUser);
user.get('/:id', getUserId);

export default user;
