import express from 'express';
import authRoutes from './auth.js';
import productRouter from './product.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRouter);

export default router;
