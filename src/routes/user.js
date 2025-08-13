import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getUserData, userUpdate } from '#controllers/userController.js';

const user = express.Router();

user.get('/', authMiddleware, getUserData);
user.patch('/update', authMiddleware, userUpdate);

export default user;
