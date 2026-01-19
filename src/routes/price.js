import express from 'express';
import { importPriceFromGoogleSheet, updateSingleProductPrice } from '#controllers/PriceController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { importProductsFromGoogleSheetValidator } from '#validations/products.js';
import { updateSingleProductPriceValidator } from '#validations/price.js';
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

/* UPDATE SINGLE PRICE */
/**
 * @openapi
 * /price/single:
 *   patch:
 *     tags: [Price]
 *     summary: Update price for a single product
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - price
 *             properties:
 *               productId:
 *                 type: string
 *                 example: "64d2f9c8e4b0c8b1f8a7c123"
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 example: 199
 *               minPrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 150
 *               maxPrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 250
 *               msrp:
 *                 type: number
 *                 minimum: 0
 *                 example: 299
 *               purchasePrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 120
 *             required: [productId, price]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
priceRouter.patch(
  '/single',
  updateSingleProductPriceValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  updateSingleProductPrice
);

export default priceRouter;
