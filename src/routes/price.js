import express from 'express';
import { importPriceFromGoogleSheet, importPriceFromCsvFile } from '#controllers/PriceController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import { importProductsFromGoogleSheetValidator, importProductsFromCsvFileValidator } from '#validations/products.js';
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

export default priceRouter;
