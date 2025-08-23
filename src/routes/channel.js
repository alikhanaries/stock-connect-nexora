import express from 'express';
import { getAllChannelsFromChannelPartner, getAllChannels } from '../controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', authMiddleware, getAllChannelsFromChannelPartner);
// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', authMiddleware, getAllChannels);

export default router;
