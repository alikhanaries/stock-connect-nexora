import express from 'express';
import { syncXokidsPrice } from '../controllers/priceController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();
router.get('/sync', authMiddleware, verifySellerAccess, syncXokidsPrice);

export default router;
