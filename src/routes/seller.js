import express from 'express';
import {
  softDeleteSellers,
  updateSeller,
  updateSellerStatus,
  createSeller,
  getAllUserSeller,
  getSellerById,
  savePickupAddress,
  getAyMakanCities,
  getAllPickupAddresses,
  updatePickupAddress,
  deletePickupAddress,
  getAllSeller,
  getSellerPickupAddresses,
} from '#controllers/SellerController.js';
import { authMiddleware, authorize, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import {
  softDeleteSellerValidator,
  updateSellerStatusValidator,
  updateSellerValidator,
  createSellerValidator,
  getAllSellerValidator,
  getSellerByIdValidator,
  savePickupAddressValidator,
  getAymaknCityValidator,
  getAllPickupAddressesValidator,
  updatePickupAddressValidator,
  deletePickupAddressValidator,
  getSellerPickupAddressesValidator,
} from '#validations/sellers.js';
const seller = express.Router();
//GET SELLER PICKUP ADDRESS
seller.get(
  '/getSellerPickupAddresses',
  getSellerPickupAddressesValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getSellerPickupAddresses
);
/**
 * @swagger
 * tags:
 *   name: Sellers
 *   description: Seller management APIs
 */
/**
 * @swagger
 * /seller/create:
 *   post:
 *     tags: [Sellers]
 *     summary: Create a new seller
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
 *             oneOf:
 *               # Case 1: Only name (no Shopify config)
 *               - type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                 required:
 *                   - name
 *
 *               # Case 2: Name + full Shopify config
 *               - type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   shopifyStoreUrl:
 *                     type: string
 *                     format: uri
 *                     example: https://example.myshopify.com
 *                   shopifyApiVersion:
 *                     type: string
 *                     example: 2025-10
 *                   shopifyAccessToken:
 *                     type: string
 *                     example: shpat_xxxxxxxxx
 *                 required:
 *                   - name
 *                   - shopifyStoreUrl
 *                   - shopifyApiVersion
 *                   - shopifyAccessToken
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { $ref: "#/components/schemas/SuccessResponse" }
 *       409: { $ref: "#/components/schemas/FailResponse" }
 *       500: { $ref: "#/components/schemas/FailResponse" }
 */

seller.post(
  '/create',
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  createSellerValidator,
  checkLanguage,
  createSeller
);

/**
 * @swagger
 * /seller:
 *   get:
 *     tags: [Sellers]
 *     summary: Get all sellers
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
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc] }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.get('/', getAllSellerValidator, checkLanguage, authMiddleware, getAllUserSeller);
seller.get('/getAllSeller', checkLanguage, getAllSeller);

/**
 * @swagger
 * /seller/bulk-delete:
 *   delete:
 *     tags: [Sellers]
 *     summary: Soft delete multiple sellers
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
seller.delete(
  '/bulk-delete',
  softDeleteSellerValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  softDeleteSellers
);

/**
 * @swagger
 * /seller/status-update:
 *   patch:
 *     tags: [Sellers]
 *     summary: Update seller status (active/inactive)
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
seller.patch(
  '/status-update',
  updateSellerStatusValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSellerStatus
);
// GET SELLER PICKUP ADDRESS LIST API

/**
 * @swagger
 * /seller/getAllPickupAddresses:
 *   get:
 *     tags: [Sellers]
 *     summary: Get all pickup addresses
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.get(
  '/getAllPickupAddresses',
  getAllPickupAddressesValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getAllPickupAddresses
);

/**
 * @swagger
 * /seller/{id}:
 *   patch:
 *     tags: [Sellers]
 *     summary: Update seller details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/UpdateSellerRequest" }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.patch(
  '/:id',
  updateSellerValidator,
  checkLanguage,
  authMiddleware,
  authorize(USER_ROLES.MASTER_ADMIN),
  updateSeller
);

// Update pickup address
/**
 * @swagger
 * /seller/updatePickupAddress/{id}:
 *   put:
 *     tags: [Sellers]
 *     summary: Update seller pickup address
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/PickupAddressRequest" }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.put(
  '/updatePickupAddress/:id',
  updatePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  updatePickupAddress
);

// Delete pickup address
/**
 * @swagger
 * /seller/deletePickupAddress/{id}:
 *   delete:
 *     tags: [Sellers]
 *     summary: Delete pickup address
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.delete(
  '/deletePickupAddress/:id',
  deletePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  deletePickupAddress
);

//GET AYMAKN CITY LIST
/**
 * @swagger
 * /seller/getAyMakanCities:
 *   get:
 *     tags: [Sellers]
 *     summary: Fetch Aymakan city list
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 */
seller.get('/getAyMakanCities', getAymaknCityValidator, checkLanguage, authMiddleware, getAyMakanCities);

// SAVE SELLER PICKUP ADDRESS API
/**
 * @swagger
 * /seller/savePickupAddress:
 *   post:
 *     tags: [Sellers]
 *     summary: Save a seller pickup address
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/PickupAddressRequest" }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201: { $ref: "#/components/schemas/SuccessResponse" }
 */
seller.post(
  '/savePickupAddress',
  savePickupAddressValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  savePickupAddress
);

/**
 * @swagger
 * /seller/{id}:
 *   get:
 *     tags: [Sellers]
 *     summary: Get seller by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
seller.get('/:id', getSellerByIdValidator, checkLanguage, authMiddleware, getSellerById);

export default seller;
