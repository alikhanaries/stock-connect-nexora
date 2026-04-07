import express from 'express';
import { fetchProducts } from '../controllers/productController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';
const ProductsRouter = express.Router();
ProductsRouter.get('/sync', authMiddleware, verifySellerAccess, fetchProducts);

export default ProductsRouter;
