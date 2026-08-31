import express from 'express';
import { syncInventory } from '../controllers/inventoryController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();
router.get('/sync-stock', authMiddleware, verifySellerAccess, syncInventory);

export default router;
