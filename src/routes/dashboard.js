import express from 'express';
import { getOrderFlow, getorderOverview, getAnalytics } from '#controllers/DashboardController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { orderFlowStatusValidator } from '#validations/dashboard.js';
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

export default dashboardRoutes;
