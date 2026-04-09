import { authMiddleware, checkLanguage, verifyMultipleSellerAccess } from '#middleware/index.js';
import { getTransactionHistoryData, getFinanceDashboardData, syncFinanceData } from '#controllers/FinanceController.js';
import { transactionHistoryValidator, financeDashboardValidator } from '#validations/finance.js';
import express from 'express';

const financeRouter = express.Router();

financeRouter.get(
  '/transaction-history',
  transactionHistoryValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getTransactionHistoryData
);

financeRouter.get(
  '/finance-overview',
  financeDashboardValidator,
  checkLanguage,
  authMiddleware,
  verifyMultipleSellerAccess,
  getFinanceDashboardData
);

financeRouter.get('/finance-sync', checkLanguage, authMiddleware, syncFinanceData);

export default financeRouter;
