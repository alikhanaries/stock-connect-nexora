import express from 'express';
import { getOrderFlow } from '#controllers/DashboardController.js';
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

export default dashboardRoutes;
