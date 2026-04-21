import express from 'express';
import productsRouter from './product.js';
import inventoryRouter from './inventory.js';
import OrdersRouter from './order.js';
const router = express.Router();

router.use('/products', productsRouter);
router.use('/inventory', inventoryRouter);
router.use('/orders', OrdersRouter);
export default router;
