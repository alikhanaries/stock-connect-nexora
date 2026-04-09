import { authMiddleware, checkLanguage, verifyMultipleSellerAccess } from '#middleware/index.js';
import { getTransactionHistoryData, syncFinanceData } from '#controllers/FinanceController.js';
import { transactionHistoryValidator } from '#validations/finance.js';
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

financeRouter.get('/finance-sync', checkLanguage, authMiddleware, syncFinanceData);

export default financeRouter;
