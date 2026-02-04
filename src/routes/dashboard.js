import express from 'express';
import {
  getOrderFlow,
  getorderOverview,
  getAnalytics,
  getShipmentAnalytics,
  getInventoryStatus,
  getTopPerformersProducts,
  getSalesByChannel,
} from '#controllers/DashboardController.js';
import { authMiddleware, checkLanguage, verifySellerAccess, verifyMultipleSellerAccess } from '#middleware/index.js';
import {
  orderFlowStatusValidator,
  orderOverviewValidator,
  orderAnalyticsValidator,
  statusValidator,
  inventoryStatusValidator,
  topOrdersValidator,
  salesByChannelValidator,
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
  verifySellerAccess,
  getShipmentAnalytics
);

dashboardRoutes.get(
  '/top-orders',
  topOrdersValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getTopPerformersProducts
);

dashboardRoutes.get(
  '/inventory-status',
  inventoryStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getInventoryStatus
);

dashboardRoutes.get(
  '/sales-by-channel',
  salesByChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getSalesByChannel
);

export default dashboardRoutes;
