import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { syncFinanceData } from '#controllers/FinanceController.js';
import express from 'express';

const financeRouter = express.Router();

financeRouter.get('/finance-sync', checkLanguage, authMiddleware, verifySellerAccess, syncFinanceData);

export default financeRouter;
