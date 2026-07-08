import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';
import express from 'express';
import { SyncCatchInventory } from '../controllers/inventoryController.js';
const InventoryRouter = express.Router();
InventoryRouter.get('/sync-stock', authMiddleware, verifySellerAccess, SyncCatchInventory);

export default InventoryRouter;
