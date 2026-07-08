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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *     security:
 *       - bearerAuth: []
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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (must be greater than 0)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 10
 *         description: Items per page (1-200)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           default: ''
 *         description: Search term to filter channels
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *     security:
 *       - bearerAuth: []
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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: Optional seller ID (24-character hex string)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 description: Unique list of channel IDs (positive integers or numeric strings)
 *                 items:
 *                   oneOf:
 *                     - type: integer
 *                       minimum: 1
 *                     - type: string
 *                       pattern: '^\d+$'
 *                 example: [1, 2, 3]
 *     security:
 *       - bearerAuth: []
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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: Optional seller ID (24-character hex string)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, status]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 description: List of channel IDs (positive integers)
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 example: [1, 2, 3]
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 example: active
 *     security:
 *       - bearerAuth: []
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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: Optional seller ID (24-character hex string)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 minItems: 1
 *                 description: List of channel IDs to remove (positive integers)
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 example: [1, 2, 3]
 *     security:
 *       - bearerAuth: []
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
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *           default: en
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (must be greater than 0)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 10
 *         description: Items per page (1-200)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter user channels
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, removed]
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [channelName, createdAt, ordersCount, productsCount]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         description: Optional seller ID (24-character hex string)
 *     security:
 *       - bearerAuth: []
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
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *         description: Channel ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sampleTemplate:
 *                 type: object
 *                 description: Sample template payload to store for the channel
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Channel template updated
 */
router.put('/:channelId/sample-template', authMiddleware, updateChannelSampleTemplate);

export default router;
