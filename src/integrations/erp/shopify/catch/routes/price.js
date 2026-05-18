import express from 'express';
import { SyncCatchPrice } from '../controllers/priceController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync-price', authMiddleware, verifySellerAccess, SyncCatchPrice);

export default router;
