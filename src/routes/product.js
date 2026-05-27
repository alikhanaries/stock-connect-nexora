import {
  deleteMultipleProducts,
  deleteProduct,
  getProducts,
  syncProducts,
  getProductById,
  getTopSellingProduct,
  getUserUnassignedProducts,
  importProductsFromCsvFile,
  importProductsFromGoogleSheet,
  pushProductToChannelEngine,
  updateProductStatus,
  getUserChannelProducts,
  addProductsToUserChannel,
  unlinkProductFromChannel,
  exportProducts,
  exportUserChannelProducts,
  searchProducts,
  freezeOrUnfreezeProducts,
  getExpressWareHouseProducts,
  translateProductField,
  getProgressStatus,
} from '#controllers/ProductController.js';
import { authMiddleware, checkLanguage, validateFile, verifySellerAccess } from '#middleware/index.js';
import {
  deleteMultipleProductsValidator,
  importProductsFromCsvFileValidator,
  importProductsFromGoogleSheetValidator,
  unlinkProductFromChannelValidator,
  exportProductsValidator,
  freezeOrUnfreezeProductsValidator,
  translateProductFieldValidator,
} from '#validations/products.js';
import express from 'express';
import {
  addProductsToUserChannelValidator,
  getProductsValidator,
  getUserUnassignedProductsValidator,
  getUserChannelProductsValidator,
  pushProductsToChannelEngineValidator,
  deleteProductValidator,
  getProductByIdValidator,
  getTopSellingProductValidator,
  updateProductStatusValidator,
  syncProductsValidator,
  getExpressWareHouseProductsValidator,
} from '#validations/products.js';
import upload from '#helpers/FileHandler.js'; // the above multer setup

const productsRouter = express.Router();

//productsRouter.use(authMiddleware);

/**
 * @openapi
 * /products/getExpressWareHouseProducts/{sellerId}:
 *   get:
 *     tags: [Products]
 *     summary: Get Express Warehouse Products
 *
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *
 *       - in: query
 *         name: channelId
 *         schema: { type: string }
 *
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *
 *       - in: query
 *         name: productType
 *         schema: { type: string, example: simple,configurable }
 *
 *       - in: query
 *         name: minStockCount
 *         schema: { type: number }
 *
 *       - in: query
 *         name: maxStockCount
 *         schema: { type: number }
 *
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *
 *       - in: query
 *         name: filter
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items: { type: string }
 *
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       401: { $ref: "#/components/schemas/UnauthorizedResponse" }
 *       500: { $ref: "#/components/schemas/ErrorResponse" }
 */
productsRouter.get(
  '/getExpressWareHouseProducts/:sellerId',
  getExpressWareHouseProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getExpressWareHouseProducts
);
/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Get all products
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.get('/', getProductsValidator, checkLanguage, authMiddleware, verifySellerAccess, getProducts);

/* DELETE PRODUCT BY ID*/

/**
 * @openapi
 * /products/deleteProduct/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product by ID
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.delete(
  '/deleteProduct/:id',
  deleteProductValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  deleteProduct
);

/**
 * @openapi
 * /products/getProduct/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.get('/getProduct/:id', getProductByIdValidator, checkLanguage, authMiddleware, getProductById);

productsRouter.get(
  '/product-sync/:channel',
  syncProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  syncProducts
);

/* UPLOAD PRODUCTS FROM GOOGLE SHEET */
/**
 * @openapi
 * /products/importProductsFromGoogleSheet:
 *   post:
 *     tags: [Products]
 *     summary: Import products from Google Sheet
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
productsRouter.post(
  '/importProductsFromGoogleSheet',
  importProductsFromGoogleSheetValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  importProductsFromGoogleSheet
);

/* UPLOAD PRODUCTS FROM CSV FILE */
/**
 * @openapi
 * /products/importProductsFromCsvFile:
 *   post:
 *     tags: [Products]
 *     summary: Import products from CSV file
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
productsRouter.post(
  '/importProductsFromCsvFile',
  importProductsFromCsvFileValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  upload.single('file'),
  validateFile,
  importProductsFromCsvFile
);

/**
 * @openapi
 * /products/push-product-to-channelengine/{channelId}:
 *   get:
 *     tags: [Products]
 *     summary: Push products to ChannelEngine
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.get(
  '/push-product-to-channelengine/:channelId',
  pushProductsToChannelEngineValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  pushProductToChannelEngine
);

/**
 * @openapi
 * /products/top-product:
 *   get:
 *     tags: [Products]
 *     summary: Get top selling products
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: channel
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.get('/top-product', getTopSellingProductValidator, checkLanguage, authMiddleware, getTopSellingProduct);

/**
 * @openapi
 * /products/update-status:
 *   patch:
 *     tags: [Products]
 *     summary: Update product status
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
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *             required: [ids, status]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.patch(
  '/update-status',
  updateProductStatusValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  updateProductStatus
);

/* DELETE MULTIPLE PRODUCTS BY ID*/
/**
 * @openapi
 * /products/deleteMultipleProducts:
 *   delete:
 *     tags: [Products]
 *     summary: Delete multiple products
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
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *             required: [ids]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.delete(
  '/deleteMultipleProducts',
  deleteMultipleProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  deleteMultipleProducts
);

/* ADD PRODUCTS TO USER CHANNEL PRODUCTSLIST */
/**
 * @openapi
 * /products/addProductsToUserChannel/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Assign products to a user channel
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *               addAll: { type: boolean }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.put(
  '/addProductsToUserChannel/:id',
  addProductsToUserChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  addProductsToUserChannel
);

/**
 * @openapi
 * /products/unlink-product-from-channel/{channelId}:
 *   delete:
 *     tags: [Products]
 *     summary: Unlink product from a channel
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *             required: [ids]
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.delete(
  '/unlink-product-from-channel/:channelId',
  unlinkProductFromChannelValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  unlinkProductFromChannel
);

/**
 * @openapi
 * /products/user-channel-products/{channelId}:
 *   get:
 *     tags: [Products]
 *     summary: Get user channel assigned products
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.get(
  '/user-channel-products/:channelId',
  getUserChannelProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserChannelProducts
);

/**
 * @openapi
 * /products/get-user-unassigned-products/{channelId}:
 *   get:
 *     tags: [Products]
 *     summary: Get products not assigned to this channel
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.get(
  '/get-user-unassigned-products/:channelId',
  getUserUnassignedProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getUserUnassignedProducts
);

/* EXPORT PRODUCTS TO CSV */
/**
 * @openapi
 * /products/export/{sellerId}:
 *   post:
 *     tags: [Products]
 *     summary: Export products to CSV
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 */
productsRouter.get(
  '/export/:sellerId',
  exportProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  exportProducts
);

productsRouter.get(
  '/export-products/:channelId',
  getUserChannelProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  exportUserChannelProducts
);

/**
 * @openapi
 * /products/searchProducts/{sellerId}:
 *   get:
 *     tags: [Products]
 *     summary: Search products by seller
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
productsRouter.get(
  '/searchProducts/:sellerId',
  getProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  searchProducts
);

/**
 * @openapi
 * /products/freeze:
 *   patch:
 *     tags: [Products]
 *     summary: Freeze or unfreeze products
 *     description: Freeze or unfreeze products by product IDs and sync with ChannelEngine
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Response language
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *               - isFrozen
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: "65a1f8d7c9e77c0012abcd34"
 *                 description: List of product IDs
 *               isFrozen:
 *                 type: boolean
 *                 example: true
 *                 description: true = freeze, false = unfreeze
 *     responses:
 *       200:
 *         description: Products frozen/unfrozen successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Products frozen successfully
 *       400:
 *         description: Invalid request or invalid product IDs
 *       404:
 *         description: No matching products found to update
 *       500:
 *         description: Internal server error
 */

productsRouter.patch(
  '/freeze',
  freezeOrUnfreezeProductsValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  freezeOrUnfreezeProducts
);

/**
 * @openapi
 * /products/translate-field:
 *   post:
 *     tags: [Products]
 *     summary: Run AI enrichment jobs (translate / map categories / enhance images) for a seller's products
 *     description: |
 *       Global AI pipeline. The body decides which jobs run:
 *
 *       - `translateFields` (non-empty array of `{field, lang}`) → translate each field/lang via the
 *         translate service. Auto-detects source language per field and skips values already in the
 *         target language.
 *       - `mapCategories: true` → classify products against the channel categories CSV
 *         (CHANNEL_CATEGORIES_CSV env) using Gemini and write the humanized path to `categoryTrail`.
 *       - `enhanceImages: true` → reserved; not yet implemented; silently skipped.
 *
 *       At least one of the three must be provided. Runs in the background — poll
 *       /products/progress-status?type=enrich (or ?type=translate / ?type=category-map for sub-jobs).
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *         example: 692ff269d38670a5807918ac
 *       - in: query
 *         name: productId
 *         required: false
 *         description: If provided, enrich only this product. Otherwise enrich all non-removed products for the seller.
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               translateFields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [field, lang]
 *                   properties:
 *                     field: { type: string, example: nameAr }
 *                     lang:  { type: string, example: ar }
 *               enhanceImages: { type: boolean, example: true }
 *               mapCategories: { type: boolean, example: true }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       403: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 *       409: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.post(
  '/translate-field',
  translateProductFieldValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  translateProductField
);

/**
 * @openapi
 * /products/progress-status:
 *   get:
 *     tags: [Products]
 *     summary: Get the progress of the AI enrichment job (translate + map categories + enhance images)
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *         example: 692ff269d38670a5807918ac
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, example: ai-enrich }
 *         description: |
 *           Comma-separated list of progress streams to fetch. Allowed values: `ai-enrich`, `sync`.
 *           Examples: `?type=ai-enrich`, `?type=ai-enrich,sync`. The response shape is the same in both cases —
 *           a `results` object keyed by the requested types.
 *     responses:
 *       200:
 *         description: Progress status returned successfully. The `message` reflects the currently-active operation's label.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 types:
 *                   type: array
 *                   items: { type: string }
 *                   example: [ai-enrich, sync]
 *                 status:
 *                   type: string
 *                   enum: [initializing, running, done, error]
 *                   description: Aggregate status across all requested types.
 *                 results:
 *                   type: object
 *                   description: Keyed by type. Each block has its own internal status + operations.
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       status: { type: string, enum: [initializing, running, done, error] }
 *                       totalProducts: { type: integer }
 *                       updatedProducts: { type: integer }
 *                       totalOperations: { type: integer }
 *                       completedOperations: { type: integer }
 *                       operations:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             label: { type: string, example: Translate Description to Arabic }
 *                             field: { type: string, example: descriptionAr, description: "Target field on Product. categoryTrail for the category-mapping op." }
 *                             lang:  { type: string, example: ar, description: "Present only on translate operations." }
 *                             total: { type: integer }
 *                             completed: { type: integer }
 *                             updated:   { type: integer, description: "Present only on category-map operations." }
 *                             percentage: { type: integer }
 *                             status: { type: string, enum: [pending, running, done, error, initializing] }
 *                             error:     { type: object, properties: { message: { type: string } }, description: "Present only when status=error." }
 *                             retryInfo: { type: object, properties: { message: { type: string } }, description: "Present only while a retry is in progress." }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       403: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
productsRouter.get('/progress-status', checkLanguage, authMiddleware, verifySellerAccess, getProgressStatus);

export default productsRouter;
