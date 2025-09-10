import express from 'express';
import {
  getAllOrders,
  getOrderById,
  getSyncedOrders,
  getOrderStats,
  getOrderComparison,
} from '#controllers/OrderController.js';

import { authMiddleware } from '#middleware/index.js';
import { getAllOrdersValidator, getOrderByIdValidator } from '#validations/orders.js';
const router = express.Router();

router.get('/', getAllOrdersValidator, authMiddleware, getAllOrders);
router.get('/stats', authMiddleware, getOrderStats);
router.get('/sync-orders', authMiddleware, getSyncedOrders);
router.get('/comparision', authMiddleware, getOrderComparison);
router.get('/:id', getOrderByIdValidator, authMiddleware, getOrderById);


export default router;
