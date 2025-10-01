import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
} from '#controllers/ChannelsController.js';
import { authMiddleware } from '#middleware/index.js';
import {
  getAllChannelsFromChannelPartnerValidator,
  getAllChannelsValidator,
  getAllUserChannelsValidator,
  removeUserChannelsValidator,
  saveUserChannelsValidator,
  updateUserChannelsValidator,
} from '#validations/channels.js';

const router = express.Router();
// USE LANGIAGE MIDDLEWARE GLOBALLY FOR THIS ROUTE
router.use(checkLanguage);
// /* GET ALL CHANNEL LIST FROM CHANNEL PARTNER */
router.get(
  '/getAllChannelsFromChannelPartner',
  getAllChannelsFromChannelPartnerValidator,
  authMiddleware,
  getAllChannelsFromChannelPartner
);
// /* GET ALL CHANNEL LIST FROM DATABASE */
router.get('/getAllChannels', getAllChannelsValidator, authMiddleware, getAllChannels);
// /* SAVE USER CHANNELS  */
router.put('/addChannels/:sellerId', saveUserChannelsValidator, authMiddleware, saveUserChannels);
/* GET USER CHANNEL LIST */

router.patch(
  '/update-user-channels-status/:sellerId',
  updateUserChannelsValidator,
  authMiddleware,
  updateUserChannelsStatus
);

router.delete('/remove-user-channel/:sellerId', removeUserChannelsValidator, authMiddleware, removeUserChannels);

router.get('/getAllUserChannels/:userId/:sellerId', getAllUserChannelsValidator, authMiddleware, getAllUserChannels);

export default router;
