import express from 'express';
import upload from '#helpers/FileHandler.js';
import {
  importMarketPlaceCategoriesFromCsv,
  mapCategory,
  getMarketplaceCategories,
  getStockConnectCategories,
  getMarketPlaceCategoryTrails,
} from '../controllers/CategoryController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import {
  importMarketPlaceCategoriesValidator,
  mapCategoryValidator,
  getMarketplaceCategoriesValidator,
  getStockConnectCategoriesValidator,
  getMarketPlaceCategoryTrailsValidator,
} from '#validations/category.js';
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category management APIs
 */

/**
 * @swagger
 * /category/importMarketPlaceCategories/{marketPlaceId}:
 *   post:
 *     tags: [Categories]
 *     summary: Import marketplace categories from CSV
 *     description: Uploads a CSV file to import categories into the system for the given marketplace
 *     parameters:
 *       - in: path
 *         name: marketPlaceId
 *         required: true
 *         description: Marketplace ID to import categories for
 *         schema:
 *           type: string
 *       - in: header
 *         name: Accept-Language
 *         description: Language for response
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV accepted for background processing
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.post(
  '/importMarketPlaceCategories/:marketPlaceId',
  importMarketPlaceCategoriesValidator,
  checkLanguage,
  authMiddleware,
  upload.single('file'),
  validateFile,
  importMarketPlaceCategoriesFromCsv
);

/**
 * @swagger
 * /category/getMarketPlaceCategoryTrails/{productCategoryTrail}:
 *   get:
 *     tags: [Categories]
 *     summary: Get marketplace category trails for a platform category
 *     description: Fetches all marketplace category trails mapped to a given platform category trail
 *     parameters:
 *       - in: path
 *         name: productCategoryTrail
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         description: Language for response
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get(
  '/getMarketPlaceCategoryTrails/:productCategoryTrail',
  getMarketPlaceCategoryTrailsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getMarketPlaceCategoryTrails
);

/**
 * @swagger
 * /category/mapCategory:
 *   put:
 *     tags: [Categories]
 *     summary: Map categories to marketplace
 *     description: Maps platform categories to marketplace categories in bulk
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         description: Language for response
 *         required: false
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
 *               marketPlaceId:
 *                 type: string
 *               categoryDatas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     platformCategoryId:
 *                       type: string
 *                     marketplaceCategoryId:
 *                       type: string
 *             required: [marketPlaceId, categoryDatas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.put('/mapCategory', mapCategoryValidator, checkLanguage, authMiddleware, verifySellerAccess, mapCategory);

/**
 * @swagger
 * /category/getStockConnectCategories:
 *   get:
 *     tags: [Categories]
 *     summary: Get StockConnect categories
 *     description: Fetches platform categories for the seller, optionally filtered by search term
 *     parameters:
 *       - in: query
 *         name: search
 *         description: Search term to filter categories
 *         required: false
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         description: Language for response
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get(
  '/getStockConnectCategories',
  getStockConnectCategoriesValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getStockConnectCategories
);

/**
 * @swagger
 * /category/getMarketplaceCategories/{marketPlaceId}:
 *   get:
 *     tags: [Categories]
 *     summary: Get categories from a marketplace
 *     description: Fetches categories from a specific marketplace, optionally filtered by search term
 *     parameters:
 *       - in: path
 *         name: marketPlaceId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         required: false
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         description: Language for response
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get(
  '/getMarketplaceCategories/:marketPlaceId',
  getMarketplaceCategoriesValidator,
  checkLanguage,
  authMiddleware,
  getMarketplaceCategories
);

export default router;
