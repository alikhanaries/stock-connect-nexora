import express from 'express';
import authRoutes from './auth.js';
import productRouter from '#routes/product.js';
import importListRouter from '#routes/importList.js';
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRouter);
router.use('/import-list', importListRouter);

export default router;
