import express from 'express';
import productsRouter from './product.js';
import inventoryRouter from './inventory.js';
import ordersRouter from './order.js';
import priceRouter from './price.js';
const router = express.Router();

router.use('/products', productsRouter);
router.use('/inventory', inventoryRouter);
router.use('/orders', ordersRouter);
router.use('/price', priceRouter);
export default router;
