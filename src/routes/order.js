import express from 'express';
import {
  getAllOrders,
  getOrderById,
  getSyncedOrders,
  getOrderStats,
  getOrderComparison,
  merchantCancelById,
} from '#controllers/OrderController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import {
  getAllOrdersValidator,
  getOrderByIdValidator,
  getOrderComparisonValidator,
  merchantCancelIdValidator,
  orderStatsValidator,
  syncOrdersValidator,
} from '#validations/orders.js';
const router = express.Router();

router.get('/', getAllOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, getAllOrders);
router.get('/stats', orderStatsValidator, checkLanguage, authMiddleware, verifySellerAccess, getOrderStats);
router.get('/sync-orders', syncOrdersValidator, checkLanguage, authMiddleware, verifySellerAccess, getSyncedOrders);
router.get(
  '/comparision',
  getOrderComparisonValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getOrderComparison
);
router.patch('/merchant-cancellation', merchantCancelIdValidator, checkLanguage, authMiddleware, merchantCancelById);
router.get('/:id', getOrderByIdValidator, checkLanguage, authMiddleware, getOrderById);

export default router;
