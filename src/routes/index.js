import express from 'express';
import channelRouter from './channelRouter.js';

const router = express.Router();

router.use('/channel', channelRouter);

export default router;
