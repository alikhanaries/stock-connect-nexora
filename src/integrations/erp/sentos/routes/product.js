import express from 'express';
import { syncSentosProducts } from '../controllers/productController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /erp/sentos/products/sync:
 *   get:
 *     tags: [Sentos ERP]
 *     summary: Sync Sentos products
 *     description: Imports Sentos catalogue into StockConnect for the configured seller. Zero-stock variants are skipped.
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
 *         description: Product sync started in background
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FailResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FailResponse'
 */
router.get('/sync', authMiddleware, verifySellerAccess, syncSentosProducts);

export default router;
