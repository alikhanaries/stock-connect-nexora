import express from 'express';
import {
  getAllOrders,
  getOrderById,
  getSyncedOrders,
  getOrderStats,
  getOrderComparison,
} from '#controllers/OrderController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import { getAllOrdersValidator, getOrderByIdValidator, getOrderComparisonValidator } from '#validations/orders.js';
const router = express.Router();

router.get('/', checkLanguage, getAllOrdersValidator, authMiddleware, getAllOrders);
router.get('/stats', checkLanguage, authMiddleware, getOrderStats);
router.get('/sync-orders', checkLanguage, authMiddleware, getSyncedOrders);
router.get('/comparision', checkLanguage, getOrderComparisonValidator, authMiddleware, getOrderComparison);
router.get('/:id', checkLanguage, getOrderByIdValidator, authMiddleware, getOrderById);


export default router;
