import express from 'express';
import authRoutes from './auth.js';
import user from './user.js';
import channel from './channel.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', user);
router.use('/channel', channel);

export default router;
