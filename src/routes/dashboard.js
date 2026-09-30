import express from 'express';
import {
  getOrderFlow,
  getorderOverview,
  getAnalytics,
  getShipmentAnalytics,
  getInventoryStatus,
  getChannelStatus,
  getTopPerformersProducts,
  getSalesByChannel,
  getOrdersByChannel,
  getReturnsOverview,
  getCancelOrdersOverview,
  downloadActiveProducts,
  downloadActiveInventoryPrice,
} from '#controllers/DashboardController.js';
import {
  authMiddleware,
  authorize,
  requireMasterAdmin,
  checkLanguage,
  verifyMultipleSellerAccess,
} from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import {
  orderFlowStatusValidator,
  orderOverviewValidator,
  orderAnalyticsValidator,
  statusValidator,
  inventoryStatusValidator,
  topProductsValidator,
  salesByChannelValidator,
  ordersByChannelValidator,
  channelStatusValidator,
  returnStatusValidator,
  cancelStatusValidator,
  downloadActiveProductsValidator,
  downloadActiveInventoryPriceValidator,
} from '#validations/dashboard.js';
const dashboardRoutes = express.Router();

dashboardRoutes.get(
  '/order-flow',
  orderFlowStatusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getOrderFlow
);

dashboardRoutes.get(
  '/order-overview',
  orderOverviewValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getorderOverview
);

dashboardRoutes.get(
  '/order-analytics',
  orderAnalyticsValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getAnalytics
);

dashboardRoutes.get(
  '/shipment-status',
  statusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getShipmentAnalytics
);

dashboardRoutes.get(
  '/top-products',
  topProductsValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getTopPerformersProducts
);

dashboardRoutes.get(
  '/inventory-status',
  inventoryStatusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getInventoryStatus
);

dashboardRoutes.get(
  '/channel-status',
  channelStatusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getChannelStatus
);

dashboardRoutes.get(
  '/sales-by-channel',
  salesByChannelValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getSalesByChannel
);

dashboardRoutes.get(
  '/orders-by-channel',
  ordersByChannelValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getOrdersByChannel
);

dashboardRoutes.get(
  '/returns-overview',
  returnStatusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getReturnsOverview
);

dashboardRoutes.get(
  '/cancels-overview',
  cancelStatusValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getCancelOrdersOverview
);

/**
 * @openapi
 * /dashboard/download-active-products:
 *   get:
 *     tags: [Dashboard]
 *     summary: Download all active products (Master Admin)
 *     description: >
 *       Streams a CSV of every product with status active across all sellers/brands.
 *       Generated on each request. Master Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: "#/components/schemas/FailResponse"
 *       403:
 *         $ref: "#/components/schemas/FailResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */
dashboardRoutes.get(
  '/download-active-products',
  downloadActiveProductsValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  downloadActiveProducts
);

/**
 * @openapi
 * /dashboard/download-active-inventory-price:
 *   get:
 *     tags: [Dashboard]
 *     summary: Download active inventory and price (Master Admin)
 *     description: >
 *       Streams a CSV with Brand Name, SKU, Inventory, and Price for every active simple variant
 *       across all brands. Latest values from the database on each request. Master Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: "#/components/schemas/FailResponse"
 *       403:
 *         $ref: "#/components/schemas/FailResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */
dashboardRoutes.get(
  '/download-active-inventory-price',
  downloadActiveInventoryPriceValidator,
  checkLanguage,
  authMiddleware,
  requireMasterAdmin,
  downloadActiveInventoryPrice
);

export default dashboardRoutes;
