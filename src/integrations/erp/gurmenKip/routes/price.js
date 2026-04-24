import express from 'express';
import { syncKipPrice } from '../controllers/PriceController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync-price', authMiddleware, verifySellerAccess, syncKipPrice);

export default router;
