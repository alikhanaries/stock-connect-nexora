import express from 'express';
import {
  importPriceFromGoogleSheet,
  importPriceFromCsvFile,
  updateSingleProductPrice,
  syncPriceToChannelEngine,
} from '#controllers/PriceController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import { importProductsFromGoogleSheetValidator, importProductsFromCsvFileValidator } from '#validations/products.js';
import { updateSingleProductPriceValidator, syncPriceToChannelEngineValidator } from '#validations/price.js';
import upload from '#helpers/FileHandler.js'; // the above multer setup
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

/* UPLOAD PRICE FROM CSV FILE */
/**
 * @openapi
 * /price/importPriceFromCsvFile:
 *   post:
 *     tags: [Price]
 *     summary: Import price from CSV file
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *             required: [file]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
priceRouter.post(
  '/importPriceFromCsvFile',
  importProductsFromCsvFileValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  upload.single('file'),
  validateFile,
  importPriceFromCsvFile
);

/* SYNC PRICE TO CHANNEL */
/**
 * @openapi
 * /price/sync/pricing:
 *   get:
 *     tags: [Price]
 *     summary: Sync price to channel engine
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Seller ID for which price should be synced to channel
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
priceRouter.get(
  '/sync/pricing',
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  syncPriceToChannelEngineValidator,
  syncPriceToChannelEngine
);

export default priceRouter;
