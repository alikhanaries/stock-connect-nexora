getAllChannelsFromChannelPartner;

import express from 'express';
import { getAllChannelsFromChannelPartner } from '../controllers/channelController.js';
//import { getAllChannelsFromChannelPartnerValidator } from '../validators/channelValidator.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get(
  '/getAllChannelsFromChannelPartner',
  //  getAllChannelsFromChannelPartnerValidator, // IT IS COMMENTED FOR WHEN AUTHORIZATION KEY WILL BE ADDED
  getAllChannelsFromChannelPartner
);

export default router;
