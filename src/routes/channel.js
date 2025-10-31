import express from 'express';
import { checkLanguage, verifySellerAccess } from '#middleware/index.js';
import {
  getAllChannelsFromChannelPartner,
  getAllChannels,
  saveUserChannels,
  getAllUserChannels,
  updateUserChannelsStatus,
  removeUserChannels,
  updateChannelSampleTemplate,
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
router.get('/getAllChannels', getAllChannelsValidator, authMiddleware, verifySellerAccess, getAllChannels);
// /* SAVE USER CHANNELS  */
router.put('/addChannels', saveUserChannelsValidator, authMiddleware, verifySellerAccess, saveUserChannels);
/* GET USER CHANNEL LIST */

router.patch(
  '/update-user-channels-status',
  updateUserChannelsValidator,
  authMiddleware,
  verifySellerAccess,
  updateUserChannelsStatus
);

router.delete(
  '/remove-user-channel',
  removeUserChannelsValidator,
  authMiddleware,
  verifySellerAccess,
  removeUserChannels
);

router.get('/getAllUserChannels', getAllUserChannelsValidator, authMiddleware, verifySellerAccess, getAllUserChannels);

router.put('/:channelId/sample-template', updateChannelSampleTemplate);

export default router;
