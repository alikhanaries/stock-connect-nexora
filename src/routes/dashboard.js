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
} from '#controllers/DashboardController.js';
import { authMiddleware, checkLanguage, verifyMultipleSellerAccess } from '#middleware/index.js';
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
export default dashboardRoutes;
