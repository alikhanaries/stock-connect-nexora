import express from 'express';
import productsRouter from './product.js';
const router = express.Router();

router.use('/products', productsRouter);
export default router;
