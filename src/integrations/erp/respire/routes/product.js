import express from 'express';
import { syncRespireProducts } from '../controllers/productController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync', authMiddleware, verifySellerAccess, syncRespireProducts);

export default router;
