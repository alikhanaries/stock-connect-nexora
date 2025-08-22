import express from 'express';
import { getAllChannelsFromChannelPartner } from '../controllers/ChannelController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', authMiddleware, getAllChannelsFromChannelPartner);

export default router;
