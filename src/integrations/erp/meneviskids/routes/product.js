import express from 'express';
import { syncMeneviskidsProducts } from '../controllers/ProductController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /erp/meneviskids/products/sync:
 *   get:
 *     tags: [Menevis Kids]
 *     summary: Sync Menevis Kids products from XML feed
 *     description: Fetches the Menevis Kids XML feed, maps products, and upserts them in the background for the requested seller.
 *     parameters:
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB seller ID for Menevis Kids
 *       - in: query
 *         name: isImageUpdate
 *         required: false
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Set to true to refresh images for existing SKUs
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
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/sync', authMiddleware, verifySellerAccess, syncMeneviskidsProducts);

export default router;
