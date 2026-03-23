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
  exportOrders,
  generateSellerInvoice,
} from '#controllers/OrderController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
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
} from '#validations/orders.js';
const router = express.Router();

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
 *         name: platform
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
 *       - BearerAuth: []
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
 *         description: Field to sort by (default: orderId)
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     security:
 *       - BearerAuth: []
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
 *       - BearerAuth: []
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
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         $ref: "#/components/schemas/SuccessResponse"
 */
router.get('/sync-orders', syncOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, getSyncedOrders);

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
 *       - BearerAuth: []
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
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
router.patch('/merchant-cancellation', merchantCancelIdValidator, checkLanguage, authMiddleware, merchantCancelById);

router.get('/export', exportOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, exportOrders);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
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
 *       - BearerAuth: []
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
 *       - BearerAuth: []
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
 *       - BearerAuth: []
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

export default router;
