import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { syncFinanceData, getFinanceDashboardData } from '#controllers/FinanceController.js';
import { financeDashboardValidator } from '#validations/finance.js';
import express from 'express';

const financeRouter = express.Router();

financeRouter.get('/finance-sync', checkLanguage, authMiddleware, verifySellerAccess, syncFinanceData);
financeRouter.get(
  '/finance-overview',
  financeDashboardValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getFinanceDashboardData
);

export default financeRouter;
