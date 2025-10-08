import express from 'express';
import {
  getAllOrders,
  getOrderById,
  getSyncedOrders,
  getOrderStats,
  getOrderComparison,
  merchantCancelById,
} from '#controllers/OrderController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import {
  getAllOrdersValidator,
  getOrderByIdValidator,
  getOrderComparisonValidator,
  merchantCancelIdValidator,
} from '#validations/orders.js';
const router = express.Router();

router.get('/', getAllOrdersValidator, checkLanguage, authMiddleware, getAllOrders);
router.get('/stats', checkLanguage, authMiddleware, getOrderStats);
router.get('/sync-orders', checkLanguage, authMiddleware, getSyncedOrders);
router.get('/comparision', getOrderComparisonValidator, checkLanguage, authMiddleware, getOrderComparison);
router.get('/:id', getOrderByIdValidator, checkLanguage, authMiddleware, getOrderById);
router.patch('/merchant-cancellation', merchantCancelIdValidator, checkLanguage, authMiddleware, merchantCancelById);

export default router;
