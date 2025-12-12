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

/**
 * @swagger
 * tags:
 *   name: Channels
 *   description: Channel management APIs
 */

/**
 * @swagger
 * /channel/getAllChannelsFromChannelPartner:
 *   get:
 *     tags: [Channels]
 *     summary: Get all channels from channel partner
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Channel list fetched successfully
 */
router.get(
  '/getAllChannelsFromChannelPartner',
  getAllChannelsFromChannelPartnerValidator,
  authMiddleware,
  getAllChannelsFromChannelPartner
);
// /* GET ALL CHANNEL LIST FROM DATABASE */
/**
 * @swagger
 * /channel/getAllChannels:
 *   get:
 *     tags: [Channels]
 *     summary: Get all channels from database
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Channel list fetched successfully
 */
router.get('/getAllChannels', getAllChannelsValidator, authMiddleware, verifySellerAccess, getAllChannels);
// /* SAVE USER CHANNELS  */

/**
 * @swagger
 * /channel/addChannels:
 *   put:
 *     tags: [Channels]
 *     summary: Save user channels
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User channels saved successfully
 */
router.put('/addChannels', saveUserChannelsValidator, authMiddleware, verifySellerAccess, saveUserChannels);
/* GET USER CHANNEL LIST */
/**
 * @swagger
 * /channel/update-user-channels-status:
 *   patch:
 *     tags: [Channels]
 *     summary: Update user channel status
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Channel status updated
 */
router.patch(
  '/update-user-channels-status',
  updateUserChannelsValidator,
  authMiddleware,
  verifySellerAccess,
  updateUserChannelsStatus
);

/**
 * @swagger
 * /channel/remove-user-channel:
 *   delete:
 *     tags: [Channels]
 *     summary: Remove user channel
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Channel removed
 */
router.delete(
  '/remove-user-channel',
  removeUserChannelsValidator,
  authMiddleware,
  verifySellerAccess,
  removeUserChannels
);

/**
 * @swagger
 * /channel/getAllUserChannels:
 *   get:
 *     tags: [Channels]
 *     summary: Get all user channels
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User channel list fetched
 */
router.get('/getAllUserChannels', getAllUserChannelsValidator, authMiddleware, verifySellerAccess, getAllUserChannels);

/**
 * @swagger
 * /channel/{channelId}/sample-template:
 *   put:
 *     tags: [Channels]
 *     summary: Update channel sample template
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Channel ID
 *     responses:
 *       200:
 *         description: Channel template updated
 */
router.put('/:channelId/sample-template', authMiddleware, updateChannelSampleTemplate);

export default router;
