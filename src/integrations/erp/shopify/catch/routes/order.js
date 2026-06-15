import express from 'express';
import { pushOrders } from '../controllers/orderController.js';
import { authMiddleware, verifySellerAccess } from '#middleware/index.js';
const OrdersRouter = express.Router();

OrdersRouter.post('/pushOrders', authMiddleware, verifySellerAccess, pushOrders);

export default OrdersRouter;
