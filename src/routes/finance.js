import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { getFinanceDashboardData } from '#controllers/FinanceController.js';
import { financeDashboardValidator } from '#validations/finance.js';
import express from 'express';

const financeRouter = express.Router();

financeRouter.get(
  '/finance-overview',
  financeDashboardValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getFinanceDashboardData
);

export default financeRouter;
