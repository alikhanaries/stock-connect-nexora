import express from 'express';
import { syncXokidsInventory } from '../controllers/inventoryController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const ProductsRouter = express.Router();
ProductsRouter.get('/sync-stock', authMiddleware, verifySellerAccess, syncXokidsInventory);

export default ProductsRouter;
