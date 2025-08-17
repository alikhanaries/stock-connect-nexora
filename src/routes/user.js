import express from 'express';
import { authMiddleware } from '#middleware/index.js';
import { getAllUser, getUserData, getUserId, searchByName, userUpdate } from '#controllers/userController.js';

const user = express.Router();

user.get('/', authMiddleware, getUserData);
user.patch('/update', authMiddleware, userUpdate);
user.get('/search', searchByName);
user.get('/all', getAllUser);
user.get('/:id', getUserId);

export default user;
