getAllChannelsFromChannelPartner;

import express from 'express';
import { getAllChannelsFromChannelPartner } from '../controllers/channelController.js';
//import { getAllChannelsFromChannelPartner } from '../validators/channelValidator.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get('/getAllChannelsFromChannelPartner', getAllChannelsFromChannelPartner);

export default router;
