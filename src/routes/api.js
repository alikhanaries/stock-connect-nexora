import express from 'express';
import authRoutes from './auth.js';
import user from './user.js';
import productsRouter from './product.js';
import channel from './channel.js';
import orderRoutes from './order.js';
import seller from './seller.js';
import category from './category.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', user);
router.use('/products', productsRouter);
router.use('/channel', channel);
router.use('/orders', orderRoutes);
router.use('/seller', seller);
router.use('/category', category);

export default router;
