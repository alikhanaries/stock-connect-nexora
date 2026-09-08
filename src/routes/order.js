import express from 'express';
import {
  getAllOrders,
  getAdminOrders,
  getOrderById,
  getSyncedOrders,
  getOrderStats,
  getOrderComparison,
  merchantCancelById,
  cancelFullOrder,
  cancelPartialOrder,
  generateDocumentId,
  exportOrders,
  generateSellerInvoice,
  getAnalyticsOrders,
  handleOmnifulOrderWebhook,
  handleChannelEngineOrderWebhook,
  startOrderSync,
  getOrderSyncStatus,
} from '#controllers/OrderController.js';
import { authMiddleware, checkLanguage, verifySellerAccess, omnifulWebHookAuthMiddleware } from '#middleware/index.js';
import {
  getAllOrdersValidator,
  getOrderByIdValidator,
  getOrderComparisonValidator,
  merchantCancelIdValidator,
  orderStatsValidator,
  syncOrdersValidator,
  cancelFullOrderValidator,
  cancelPartialOrderValidator,
  exportOrdersValidator,
  generateSellerInvoiceValidator,
  getAnalyticsOrdersValidator,
  generateDocumentIdValidator,
} from '#validations/orders.js';
import upload from '#helpers/FileHandler.js';

// Multer parses multipart body before verifySellerAccess; copy sellerId into query for that middleware.
const attachSellerIdFromBody = (req, _res, next) => {
  if (!req.query.sellerId && req.body?.sellerId) {
    req.query.sellerId = req.body.sellerId;
  }
  next();
};

const router = express.Router();

// GET ALL ANALYTICS ORDERS
router.get('/getAnalyticsOrders', getAnalyticsOrdersValidator, checkLanguage, authMiddleware, getAnalyticsOrders);

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order management APIs
 */

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get all orders
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *         description: Seller MongoDB id (required for seller users; recommended for master-admin)
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: channel
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: "#/components/schemas/SuccessResponse"
 */
router.get('/', getAllOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, getAllOrders);
/**
 * @swagger
 * /orders/admin/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get orders for master-admin (global, seller, or marketplace scoped)
 *     description: >
 *       Returns all orders if no query params are provided.
 *       Optionally filter by sellerId and/or marketplace.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: sellerId
 *         schema:
 *           type: string
 *         description: Filter orders by seller
 *       - in: query
 *         name: marketplace
 *         schema:
 *           type: string
 *         description: Filter orders by marketplace (requires sellerId)
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *         description: Page number for pagination
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *         description: Number of orders per page
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search term (orderId, customer, email, etc.)
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Comma-separated order statuses (e.g., NEW, IN_PROGRESS)
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *         description: "Field to sort by (default: orderId)"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SuccessResponse"
 *       403:
 *         description: Unauthorized role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */

router.get('/admin/orders', getAllOrdersValidator, checkLanguage, authMiddleware, getAdminOrders);

/**
 * @swagger
 * /orders/stats:
 *   get:
 *     tags: [Orders]
 *     summary: Get order statistics
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: "#/components/schemas/SuccessResponse"
 */
router.get('/stats', orderStatsValidator, checkLanguage, authMiddleware, verifySellerAccess, getOrderStats);

/**
 * @swagger
 * /orders/sync-orders:
 *   get:
 *     tags: [Orders]
 *     summary: Sync latest orders from ChannelEngine
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: "#/components/schemas/SuccessResponse"
 */
router.get('/sync-orders', syncOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, getSyncedOrders);

/**
 * @swagger
 * /orders/sync-orders:
 *   post:
 *     tags: [Orders]
 *     summary: Start a background order sync (non-blocking)
 *     description: >
 *       Immediately returns a jobId (202 Accepted) and starts the full order sync
 *       in the background. Poll GET /orders/sync-status/{jobId} for progress updates.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Sync started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       example: "3f2d1a4c-8b7e-4f5d-9c0e-1a2b3c4d5e6f"
 */
router.post('/sync-orders', syncOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, startOrderSync);

/**
 * @swagger
 * /orders/sync-status/{jobId}:
 *   get:
 *     tags: [Orders]
 *     summary: Poll the progress of a background order sync
 *     description: Returns current status, progress percentage, phase label, and counts.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema: { type: string }
 *         description: The jobId returned by POST /orders/sync-orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId: { type: string }
 *                     status:
 *                       type: string
 *                       enum: [pending, running, completed, failed]
 *                     progress: { type: number, minimum: 0, maximum: 100 }
 *                     currentPhase: { type: string }
 *                     totalItems: { type: number }
 *                     syncedItems: { type: number }
 *                     errorMessage: { type: string, nullable: true }
 *       404:
 *         description: Job not found
 */
// NOTE: Must be above GET /:id to prevent route shadowing
router.get('/sync-status/:jobId', checkLanguage, authMiddleware, verifySellerAccess, getOrderSyncStatus);

/**
 * @swagger
 * /orders/comparision:
 *   get:
 *     tags: [Orders]
 *     summary: Compare orders over time periods
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         $ref: "#/components/schemas/SuccessResponse"
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 */
router.get(
  '/comparision',
  getOrderComparisonValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getOrderComparison
);

/**
 * @swagger
 * /orders/merchant-cancellation:
 *   patch:
 *     tags: [Orders]
 *     summary: Merchant cancels a full order by ID
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId: { type: string }
 *               reason: { type: string }
 *               specifics: { type: string }
 *             required: [orderId, reason]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.patch('/merchant-cancellation', merchantCancelIdValidator, checkLanguage, authMiddleware, merchantCancelById);

router.get('/export', exportOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, exportOrders);

// CHANNELENGINE WEBHOOK FOR ORDER EVENTS (CREATE / CHANGE)
// NOTE: These routes MUST be defined before GET /:id to avoid the dynamic route
// swallowing GET /channelengine-webhook as if it were an order ID.
/**
 * @swagger
 * /orders/channelengine-webhook:
 *   post:
 *     tags: [Orders]
 *     summary: ChannelEngine order event webhook (POST)
 *     description: Receives order create and change events from ChannelEngine.
 *     responses:
 *       200:
 *         description: Webhook received successfully
 *   get:
 *     tags: [Orders]
 *     summary: ChannelEngine order event webhook (GET)
 *     description: Receives order create and change notification pings from ChannelEngine.
 *     responses:
 *       200:
 *         description: Webhook received successfully
 */
router.post('/channelengine-webhook', handleChannelEngineOrderWebhook);
router.get('/channelengine-webhook', handleChannelEngineOrderWebhook);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 *     description: >
 *       Returns order details including warehouse fields on unshippedItems
 *       (availableInWarehouse, expressWarehouseAvailableQty, fulfillmentType).
 *       **id** must be the order MongoDB _id from channelengineorders (24-char hex),
 *       NOT orderId (e.g. "1682"), channelOrderNumber, or sellerId.
 *       Master-admin users must pass **sellerId** query param matching one of the order sellerIds.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: header
 *         name: Authorization
 *         required: true
 *         description: Bearer JWT token from POST /auth/login
 *         schema: { type: string, example: "Bearer eyJhbGci..." }
 *       - in: query
 *         name: sellerId
 *         required: false
 *         description: >
 *           Seller MongoDB id. Required in practice for master-admin when viewing a specific seller's order.
 *           Must match one of the order's sellerIds.
 *         schema: { type: string, example: "691ee02843f00a695364352f" }
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order MongoDB _id (24-char hex), e.g. from GET /orders response `_id`
 *         schema: { type: string, example: "69d8a2bd86bcb6d1e16dbd0f" }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get('/:id', getOrderByIdValidator, checkLanguage, authMiddleware, verifySellerAccess, getOrderById);
// /* CANCEL ORDER (FULL CANCELLATION) */
/**
 * @swagger
 * /orders/cancelFullOrder:
 *   put:
 *     tags: [Orders]
 *     summary: Cancel full order
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId: { type: string }
 *               reason: { type: string }
 *             required: [orderId, reason]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.put(
  '/cancelFullOrder',
  cancelFullOrderValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  cancelFullOrder
);
// /* CANCEL PARTIAL ORDER (PARTIAL CANCELLATION) */
/**
 * @swagger
 * /orders/cancelPartialOrder:
 *   put:
 *     tags: [Orders]
 *     summary: Cancel selected items from an order (partial cancellation)
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId: { type: string }
 *               reason: { type: string }
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     orderLineId: { type: string }
 *                     merchantProductNo: { type: string }
 *                     quantity: { type: integer }
 *                   required: [orderLineId, merchantProductNo, quantity]
 *             required: [orderId, reason, products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.put(
  '/cancelPartialOrder',
  cancelPartialOrderValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  cancelPartialOrder
);

// GENERATE ORDER INVOICE

/**
 * @swagger
 * /orders/generateSellerInvoice:
 *   post:
 *     tags: [Orders]
 *     summary: Generate seller invoice for an order
 *     description: Generates invoice PDF/data for the given orderId
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
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: MongoDB ObjectId of the order
 *                 example: 69bd24f86a31299529e7d778
 *             required: [orderId]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invoice generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Invoice generated successfully
 *                 data:
 *                   type: object
 *                   description: Invoice details or file URL/base64
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (seller access issue)
 */
router.post(
  '/generateSellerInvoice',
  generateSellerInvoiceValidator,
  authMiddleware,
  verifySellerAccess,
  generateSellerInvoice
);

router.post(
  '/generate-documentId',
  checkLanguage,
  authMiddleware,
  upload.single('file'),
  attachSellerIdFromBody,
  verifySellerAccess,
  generateDocumentIdValidator,
  generateDocumentId
);

/**
 * @swagger
 * /orders/omniful-order-webhook:
 *   post:
 *     tags: [Orders]
 *     summary: Omniful order status webhook
 *     description: Receives order and purchase order status events from Omniful. Requires webhook authentication header.
 *     security:
 *       - webhookAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [event_name, data]
 *             properties:
 *               event_name:
 *                 type: string
 *                 example: purchase_order.update.event
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook payload
 *       401:
 *         description: Missing webhook authentication header
 *       403:
 *         description: Invalid webhook authentication
 */
router.post('/omniful-order-webhook', omnifulWebHookAuthMiddleware, handleOmnifulOrderWebhook);

export default router;
