import express from 'express';
import authRoutes from './auth.js';
import productsRouter from './product.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productsRouter);

export default router;
