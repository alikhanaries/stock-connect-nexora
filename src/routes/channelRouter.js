import express from 'express';
import { getAllChannelsFromChannelPartner, getAllChannels } from '../controllers/channelController.js';
//import { getAllChannelsFromChannelPartnerValidator, getAllChannelsValidator } from '../validators/channelValidator.js';

const router = express.Router();

// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get(
  '/getAllChannelsFromChannelPartner',
  //  getAllChannelsFromChannelPartnerValidator, // IT IS COMMENTED FOR WHEN AUTHORIZATION KEY WILL BE ADDED
  getAllChannelsFromChannelPartner
);

// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get(
  '/getAllChannels',
  //  getAllChannelsValidator, // IT IS COMMENTED FOR WHEN AUTHORIZATION KEY WILL BE ADDED
  getAllChannels
);

export default router;
