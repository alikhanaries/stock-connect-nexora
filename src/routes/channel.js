import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
} from '../controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();
// USE LANGIAGE MIDDLEWARE GLOBALLY FOR THIS ROUTE
router.use(checkLanguage);
// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', authMiddleware, getAllChannelsFromChannelPartner);
// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', authMiddleware, getAllChannels);
// /* SAVE USER CHANNELS  */
router.post('/saveUserChannels', authMiddleware, saveUserChannels);
/* GET USER CHANNEL LIST */
router.get('/getAllUserChannels/:userId', authMiddleware, getAllUserChannels);
router.patch('/update-user-channels-status', authMiddleware, updateUserChannelsStatus);
export default router;
