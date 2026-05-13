import express from 'express';
import { syncXokidsProducts } from '../controllers/ProductController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync', authMiddleware, verifySellerAccess, syncXokidsProducts);

export default router;
