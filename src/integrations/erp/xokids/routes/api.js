import express from 'express';
import productsRouter from './product.js';
import inventoryRouter from './inventory.js';

const router = express.Router();

router.use('/inventory', inventoryRouter);
router.use('/products', productsRouter);
export default router;
