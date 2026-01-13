import express from 'express';
import authRoutes from './auth.js';
import user from './user.js';
import productsRouter from './product.js';
import channel from './channel.js';
import orderRoutes from './order.js';
import returnRoutes from './return.js';
import categoryRoutes from './category.js'; //
import invoiceRoutes from './invoice.js';
import seller from './seller.js';
import shipmentRoutes from './shipment.js';
import inventoryRoutes from './inventory.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/user', user);
router.use('/products', productsRouter);
router.use('/channel', channel);
router.use('/orders', orderRoutes);
router.use('/returns', returnRoutes);
router.use('/invoice', invoiceRoutes);
router.use('/category', categoryRoutes);
router.use('/seller', seller);
router.use('/shipment', shipmentRoutes);
router.use('/inventory', inventoryRoutes);
export default router;
