import express from 'express';
import { testSentosConnectionHandler } from '../controllers/connectionController.js';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * /erp/sentos/connection/test:
 *   get:
 *     tags: [Sentos ERP]
 *     summary: Test Sentos API connection
 *     description: Validates Sentos credentials configured in environment variables.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Connection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FailResponse'
 */
router.get('/test', authMiddleware, testSentosConnectionHandler);

export default router;
