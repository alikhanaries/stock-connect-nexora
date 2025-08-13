import express from 'express';
import authRoutes from './auth.js';
import user from './user.js';

const router = express.Router();

router.use('/auth', authRoutes);

router.use('/user', user);

export default router;
