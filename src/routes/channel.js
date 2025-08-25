import express from 'express';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannelData,
} from '../controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', getAllChannelsFromChannelPartner);
// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', getAllChannels);
// /* SAVE USER CHANNELS  */
router.post('/saveUserChannelData', authMiddleware, saveUserChannelData);

export default router;
