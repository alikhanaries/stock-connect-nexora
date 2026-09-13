import express from 'express';
import { syncSentosInventory } from '../controllers/inventoryController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /erp/sentos/inventory/sync-stock:
 *   get:
 *     tags: [Sentos ERP]
 *     summary: Sync Sentos inventory
 *     description: Updates stock from Sentos warehouse and pushes stock to ChannelEngine.
 *     parameters:
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Inventory sync started in background
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/sync-stock', authMiddleware, verifySellerAccess, syncSentosInventory);

export default router;
