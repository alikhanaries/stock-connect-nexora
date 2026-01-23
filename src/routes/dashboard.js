import express from 'express';
import {
  getOrderFlow,
  getorderOverview,
  getAnalytics,
  getShipmentAnalytics,
  getTopPerformersProducts,
} from '#controllers/DashboardController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { orderFlowStatusValidator, statusValidator, topOrdersValidator } from '#validations/dashboard.js';
const dashboardRoutes = express.Router();

dashboardRoutes.get(
  '/order-flow',
  orderFlowStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getOrderFlow
);

dashboardRoutes.get(
  '/order-overview',
  orderFlowStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getorderOverview
);

dashboardRoutes.get(
  '/order-analytics',
  orderFlowStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
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

export default dashboardRoutes;
