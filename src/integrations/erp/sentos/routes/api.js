import express from 'express';
import productsRouter from './product.js';
import inventoryRouter from './inventory.js';
import priceRouter from './price.js';
import connectionRouter from './connection.js';

const router = express.Router();

router.use('/products', productsRouter);
router.use('/inventory', inventoryRouter);
router.use('/price', priceRouter);
router.use('/connection', connectionRouter);

export default router;
