import express from 'express';
import { getOrderFlow, getorderOverview } from '#controllers/DashboardController.js';
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

export default dashboardRoutes;
