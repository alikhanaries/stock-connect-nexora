import express from 'express';
import {
  importInventoryFromGoogleSheet,
  importInventoryFromCsvFile,
  updateSingleInventory,
} from '#controllers/InventoryController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';

import { importProductsFromGoogleSheetValidator, importProductsFromCsvFileValidator } from '#validations/products.js';
import upload from '#helpers/FileHandler.js'; // the above multer setup
import { updateSingleInventoryValidator } from '#validations/inventory.js';
const inventoryRouter = express.Router();

/* UPLOAD INVENTORIES FROM GOOGLE SHEET */
/**
 * @openapi
 * /inventory/importInventoryFromGoogleSheet:
 *   post:
 *     tags: [Inventory]
 *     summary: Import inventory from Google Sheet
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
inventoryRouter.post(
  '/importInventoryFromGoogleSheet',
  importProductsFromGoogleSheetValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  importInventoryFromGoogleSheet
);

/* UPLOAD INVENTORY FROM CSV FILE */
/**
 * @openapi
 * /inventory/importInventoryFromCsvFile:
 *   post:
 *     tags: [Inventory]
 *     summary: Import inventory from CSV file
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
inventoryRouter.post(
  '/importInventoryFromCsvFile',
  importProductsFromCsvFileValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  upload.single('file'),
  validateFile,
  importInventoryFromCsvFile
);

/* UPDATE SINGLE INVENTORY */
/**
 * @openapi
 * /inventory/single:
 *   patch:
 *     tags: [Inventory]
 *     summary: Update stock count for a single inventory
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
 *             properties:
 *               productId:
 *                 type: string
 *               currentStockCount:
 *                 type: integer
 *                 minimum: 0
 *             required: [productId, currentStockCount]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
inventoryRouter.patch(
  '/single',
  updateSingleInventoryValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  updateSingleInventory
);

export default inventoryRouter;
