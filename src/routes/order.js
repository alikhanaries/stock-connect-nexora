import express from 'express';

import { getAllOrders, getOrderById, getOrderStats } from '#controllers/OrderController.js';
import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get('/', authMiddleware, getAllOrders);
router.get('/stats', authMiddleware, getOrderStats);
router.get('/:id', authMiddleware, getOrderById);

export default router;
