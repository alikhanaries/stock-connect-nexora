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
import dashboardRoutes from './dashboard.js';
import inventoryRoutes from './inventory.js';
import priceRoutes from './price.js';
import financeRoutes from './finance.js';
import geminiRoutes from './gemini.js';

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
router.use('/dashboard', dashboardRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/price', priceRoutes);
router.use('/finance', financeRoutes);
router.use('/gemini', geminiRoutes);
export default router;
