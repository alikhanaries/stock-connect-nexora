import express from 'express';
import { getAllOrders, getOrderById, getSyncedOrders, getOrderStats, getWeeklyOrderComparison } from '#controllers/OrderController.js';

import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get('/', authMiddleware, getAllOrders);
router.get('/stats', authMiddleware, getOrderStats);
router.get('/sync-orders', authMiddleware, getSyncedOrders);
router.get('/comparision',authMiddleware, getWeeklyOrderComparison);
router.get('/:id', authMiddleware, getOrderById);

export default router;
