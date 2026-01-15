import { authMiddleware, checkLanguage } from '#middleware/index.js';
import express from 'express';
import { uploadInvoiceController } from '../controllers/InvoiceController.js';
import { invoiceMerchantIdValidator } from '../validations/invoice.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Invoices
 *   description: Invoice fetching & upload APIs
 */

/**
 * @swagger
 * /invoice:
 *   get:
 *     tags: [Invoices]
 *     summary: Fetch invoice and upload to S3
 *     description: Fetches the invoice image from a remote service, uploads it to S3, and returns the uploaded file URL.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: merchantNo
 *         required: true
 *         description: Merchant number for which invoice is fetched
 *         schema:
 *           type: string
 *       - in: header
 *         name: Accept-Language
 *         description: Response language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     responses:
 *       200:
 *         description: Invoice uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: string
 *                   description: URL of uploaded invoice image
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */

router.get('/', invoiceMerchantIdValidator, checkLanguage, authMiddleware, uploadInvoiceController);

export default router;
