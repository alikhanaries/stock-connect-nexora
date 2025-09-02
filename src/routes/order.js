import express from 'express';

import { getAllOrders } from '#controllers/OrderController.js';
import { authMiddleware } from '#middleware/index.js';
const router = express.Router();

router.get('/', authMiddleware, getAllOrders);

export default router;
