import express from 'express';
import { importInventoryFromGoogleSheet } from '#controllers/InventoryController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';

import { importProductsFromCsvFileValidator } from '#validations/products.js';

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
  importProductsFromCsvFileValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  importInventoryFromGoogleSheet
);

export default inventoryRouter;
