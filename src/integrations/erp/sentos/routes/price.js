import express from 'express';
import { syncSentosPrice } from '../controllers/priceController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /erp/sentos/price/sync-price:
 *   get:
 *     tags: [Sentos ERP]
 *     summary: Sync Sentos prices
 *     description: Updates per-channel prices from Sentos (TL converted to SAR) and pushes prices to ChannelEngine.
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
 *         description: Price sync started in background
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/sync-price', authMiddleware, verifySellerAccess, syncSentosPrice);

export default router;
