import express from 'express';
import { syncExquiseInventory } from '../controllers/InventoryController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync-stock', authMiddleware, verifySellerAccess, syncExquiseInventory);

export default router;
