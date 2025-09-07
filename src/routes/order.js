import express from 'express';

import { getAllOrders, getOrderById } from '#controllers/OrderController.js';
import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get('/', authMiddleware, getAllOrders);
router.get('/:id', authMiddleware, getOrderById);

export default router;
