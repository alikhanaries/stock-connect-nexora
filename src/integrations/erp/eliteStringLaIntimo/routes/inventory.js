import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';
import express from 'express';
import { syncEliteStringLaIntimoStock } from '../controllers/InventoryController.js';

const router = express.Router();

router.get('/sync-stock', authMiddleware, verifySellerAccess, syncEliteStringLaIntimoStock);

export default router;
