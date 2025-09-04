import express from 'express';

import { getAllOrders, getOrderById, getSyncedOrders } from '#controllers/OrderController.js';
import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get('/', authMiddleware, getAllOrders);
router.get('/sync-orders', authMiddleware, getSyncedOrders);
router.get('/:id', authMiddleware, getOrderById);

export default router;
