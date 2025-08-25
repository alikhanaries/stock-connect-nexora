import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannelData,
  getUserAllChannels,
} from '../controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();
// USE LANGIAGE MIDDLEWARE GLOBALLY FOR THIS ROUTE
router.use(checkLanguage);
/* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', authMiddleware, getAllChannelsFromChannelPartner);
/* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', getAllChannels);
/* SAVE USER CHANNELS  */
router.post('/saveUserChannelData', authMiddleware, saveUserChannelData);
/* GET USER CHANNEL LIST */
router.get('/getUserAllChannels/:userId', getUserAllChannels);
export default router;
