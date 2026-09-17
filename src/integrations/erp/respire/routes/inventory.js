import express from 'express';
import { syncRespireInventory } from '../controllers/InventoryController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

router.get('/sync-stock', authMiddleware, verifySellerAccess, syncRespireInventory);

export default router;
