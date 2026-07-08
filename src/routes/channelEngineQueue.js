import express from 'express';
import {
  listQueueJobs,
  getQueueJob,
  getQueueJobByJobId,
  queueStats,
  listFailedQueueJobs,
  validateObjectIdParam,
} from '#controllers/ChannelEngineQueueController.js';
import {
  listQueueJobsValidator,
  queueStatsValidator,
  listFailedQueueJobsValidator,
} from '#validations/channelEngineQueue.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';

const router = express.Router();

/**
 * @openapi
 * /channel-engine-queue/stats:
 *   get:
 *     tags: [ChannelEngineQueue]
 *     summary: Get Channel Engine queue statistics
 *     description: Returns persisted job counts, live BullMQ counts, and rate limit configuration.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *         description: Filter by seller (optional for master admin)
 *     responses:
 *       200:
 *         description: Queue statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ChannelEngineQueueStats'
 *       400: { $ref: '#/components/schemas/FailResponse' }
 *       401: { $ref: '#/components/schemas/FailResponse' }
 *       404: { $ref: '#/components/schemas/FailResponse' }
 *       500: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/stats', queueStatsValidator, checkLanguage, authMiddleware, verifySellerAccess, queueStats);

/**
 * @openapi
 * /channel-engine-queue/failed:
 *   get:
 *     tags: [ChannelEngineQueue]
 *     summary: List failed Channel Engine queue jobs
 *     description: Returns paginated failed jobs with errorMessage and errorDetails.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: size
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *       - in: query
 *         name: operationType
 *         schema:
 *           type: string
 *           enum: [PRODUCTS_PUSH, PRODUCTS_FREEZE, PRODUCTS_BULK_DELETE, PRODUCTS_EXTRA_DATA, OFFER_STOCK, OFFER_PRICE, ORDER_ACKNOWLEDGE, ORDER_CANCELLATION, SHIPMENT_CREATE, SHIPMENT_DELIVERY_STATE, RETURN_MERCHANT_CREATE, RETURN_MERCHANT_ACKNOWLEDGE, RETURN_ACCEPT_REJECT]
 *       - in: query
 *         name: batchId
 *         schema: { type: string }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Failed jobs list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ChannelEngineQueueListData'
 *       400: { $ref: '#/components/schemas/FailResponse' }
 *       401: { $ref: '#/components/schemas/FailResponse' }
 *       404: { $ref: '#/components/schemas/FailResponse' }
 *       500: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(
  '/failed',
  listFailedQueueJobsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  listFailedQueueJobs
);

/**
 * @openapi
 * /channel-engine-queue/job/{jobId}:
 *   get:
 *     tags: [ChannelEngineQueue]
 *     summary: Get queue job by BullMQ job ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Queue job details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ChannelEngineQueueJob'
 *       401: { $ref: '#/components/schemas/FailResponse' }
 *       403: { $ref: '#/components/schemas/FailResponse' }
 *       404: { $ref: '#/components/schemas/FailResponse' }
 *       500: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/job/:jobId', checkLanguage, authMiddleware, getQueueJobByJobId);

/**
 * @openapi
 * /channel-engine-queue/{id}:
 *   get:
 *     tags: [ChannelEngineQueue]
 *     summary: Get queue job by tracking ID
 *     description: Returns full job details using the MongoDB tracking ID.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Queue job details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ChannelEngineQueueJob'
 *       400: { $ref: '#/components/schemas/FailResponse' }
 *       401: { $ref: '#/components/schemas/FailResponse' }
 *       403: { $ref: '#/components/schemas/FailResponse' }
 *       404: { $ref: '#/components/schemas/FailResponse' }
 *       500: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id', checkLanguage, authMiddleware, validateObjectIdParam, getQueueJob);

/**
 * @openapi
 * /channel-engine-queue:
 *   get:
 *     tags: [ChannelEngineQueue]
 *     summary: List Channel Engine queue jobs
 *     description: Paginated list with filters for status, operationType, sellerId, batchId, and date range.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: size
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [queued, active, retrying, completed, failed]
 *       - in: query
 *         name: operationType
 *         schema:
 *           type: string
 *           enum: [PRODUCTS_PUSH, PRODUCTS_FREEZE, PRODUCTS_BULK_DELETE, PRODUCTS_EXTRA_DATA, OFFER_STOCK, OFFER_PRICE, ORDER_ACKNOWLEDGE, ORDER_CANCELLATION, SHIPMENT_CREATE, SHIPMENT_DELIVERY_STATE, RETURN_MERCHANT_CREATE, RETURN_MERCHANT_ACKNOWLEDGE, RETURN_ACCEPT_REJECT]
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *       - in: query
 *         name: batchId
 *         schema: { type: string }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated queue jobs
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ChannelEngineQueueListData'
 *       400: { $ref: '#/components/schemas/FailResponse' }
 *       401: { $ref: '#/components/schemas/FailResponse' }
 *       404: { $ref: '#/components/schemas/FailResponse' }
 *       500: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', listQueueJobsValidator, checkLanguage, authMiddleware, verifySellerAccess, listQueueJobs);

export default router;
