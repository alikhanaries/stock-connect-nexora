import express from 'express';
import productsRouter from './product.js';
import inventoryRouter from './inventory.js';
const router = express.Router();

router.use('/products', productsRouter);
router.use('/inventory', inventoryRouter);

export default router;
