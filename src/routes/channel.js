import express from 'express';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
} from '../controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', authMiddleware, getAllChannelsFromChannelPartner);
// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', authMiddleware, getAllChannels);
// /* SAVE USER CHANNELS  */
router.post('/saveUserChannels', saveUserChannels);
/* GET USER CHANNEL LIST */
router.get('/getAllUserChannels/:userId', authMiddleware, getAllUserChannels);
export default router;
