import express from 'express';

import { getAllOrders } from '#controllers/OrderController.js';
const router = express.Router();

router.get('/', getAllOrders);

export default router;
