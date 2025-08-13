import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { userData, userUpdate } from '#controllers/userController.js';

const user = express.Router();

user.get('/', authMiddleware, userData);
user.patch('/update', authMiddleware, userUpdate);

export default user;
