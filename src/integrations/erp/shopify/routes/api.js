import express from 'express';
import productsRouter from './product.js';
import priceRouter from './price.js';

const router = express.Router();

router.use('/products', productsRouter);
router.use('/price', priceRouter);

export default router;
