import express from 'express';
import { importPriceFromGoogleSheet } from '#controllers/PriceController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { importProductsFromGoogleSheetValidator } from '#validations/products.js';
const priceRouter = express.Router();

/* UPLOAD PRICE FROM GOOGLE SHEET */
/**
 * @openapi
 * /price/importPriceFromGoogleSheet:
 *   post:
 *     tags: [Price]
 *     summary: Import price from Google Sheet
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url: { type: string }
 *             required: [url]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
priceRouter.post(
  '/importPriceFromGoogleSheet',
  importProductsFromGoogleSheetValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  importPriceFromGoogleSheet
);

export default priceRouter;
