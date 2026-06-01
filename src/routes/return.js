import express from 'express';
import {
  getAllReturns,
  syncReturns,
  createMerchantReturn,
  getReturnStats,
  acknowledgeMerchantReturn,
  updateReturn,
  getReturnById,
  fetchReturnsWebhook,
  exportReturns,
  handleOmnifulQCWebhook,
} from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage, verifySellerAccess, webHookAuthMiddleware } from '#middleware/index.js';
import {
  getAllReturnsValidator,
  syncReturnsValidator,
  returnValidator,
  validateReturnAck,
  updateReturnValidator,
  getReturnByIdValidator,
  getReturnStatsValidator,
  returnWebHookValidator,
  exportReturnsValidator,
} from '#validations/return.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Returns
 *   description: Return order management APIs
 */

// Get returns
/**
 * @swagger
 * /returns:
 *   get:
 *     tags: [Returns]
 *     summary: Get all return orders
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.get('/', getAllReturnsValidator, checkLanguage, authMiddleware, getAllReturns);
// Export returns as CSV
/**
 * @swagger
 * /returns/export:
 *   get:
 *     tags: [Returns]
 *     summary: Export returns as CSV
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CSV exported
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.get('/export', exportReturnsValidator, checkLanguage, authMiddleware, verifySellerAccess, exportReturns);
// Get return statistics grouped by status
/**
 * @swagger
 * /returns/stats:
 *   get:
 *     tags: [Returns]
 *     summary: Get statistics for return orders
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
router.get('/stats', getReturnStatsValidator, checkLanguage, authMiddleware, verifySellerAccess, getReturnStats);
// Sync returns from ChannelEngine to database
/**
 * @swagger
 * /returns/sync:
 *   get:
 *     tags: [Returns]
 *     summary: Sync return orders from marketplace
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get('/sync', syncReturnsValidator, checkLanguage, authMiddleware, syncReturns);
// Get a specific return by ID
/**
 * @swagger
 * /returns/{id}:
 *   get:
 *     tags: [Returns]
 *     summary: Get return order by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
router.get('/:id', getReturnByIdValidator, checkLanguage, authMiddleware, getReturnById);
// Create a new return
/**
 * @swagger
 * /returns/create:
 *   post:
 *     tags: [Returns]
 *     summary: Create a new return order
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateReturnRequest"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.post('/create', returnValidator, checkLanguage, authMiddleware, createMerchantReturn);
// Acknowledge a return
/**
 * @swagger
 * /returns/acknowledge:
 *   post:
 *     tags: [Returns]
 *     summary: Acknowledge a return order
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/AcknowledgeReturnRequest"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.post('/acknowledge', validateReturnAck, checkLanguage, authMiddleware, acknowledgeMerchantReturn);

// Update return status (status will update to received)
/**
 * @swagger
 * /returns/update:
 *   put:
 *     tags: [Returns]
 *     summary: Update return order (status will update to received)
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/UpdateReturnRequest"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
router.put('/update', updateReturnValidator, checkLanguage, authMiddleware, updateReturn);
// Webhook of return
/**
 * @swagger
 * /returns/fetchReturnsWebhook:
 *   post:
 *     tags: [Returns]
 *     summary: Webhook to receive return updates
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 */
router.post('/fetchReturnsWebhook', returnWebHookValidator, webHookAuthMiddleware, fetchReturnsWebhook);

router.post('/omniful-qc-webhook', handleOmnifulQCWebhook);

export default router;
