import express from 'express';
import { syncEntegraPrice } from '../controllers/PriceController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync-price', authMiddleware, verifySellerAccess, syncEntegraPrice);

export default router;
