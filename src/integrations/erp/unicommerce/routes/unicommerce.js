import express from 'express';
import { unicommerceAuthMiddleware } from '#root/src/integrations/erp/unicommerce/middleware/authMiddleware.js';
import { verifyUnicommerceSellerAccess } from '#root/src/integrations/erp/unicommerce/middleware/verifySellerAccessMiddleware.js';
import {
  fetchProductCount,
  fetchProducts,
} from '#root/src/integrations/erp/unicommerce/controllers/productController.js';
import { login } from '#root/src/integrations/erp/unicommerce/controllers/authController.js';
import { loginValidator } from '#root/src/integrations/erp/unicommerce/validations/auth.js';
import { checkLanguage } from '#middleware/index.js';
import { getProductCountValidator, getProductsValidator } from '../validations/products.js';
import { updateInventoryValidator } from '../validations/inventory.js';
import { updateInventory } from '../controllers/inventoryController.js';

const UniCommerceRouter = express.Router();

/**
 * @openapi
 * /authToken:
 *   post:
 *     tags: [UniCommerce]
 *     summary: Generate UniCommerce access token
 *     description: Authenticates user and returns JWT access token with sellerId.
 *
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Preferred response language
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 format: email
 *                 example: seller@example.com
 *                 description: User email address
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 128
 *                 example: Test@123
 *                 description: User password
 *
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: SUCCESS
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 sellerId:
 *                   type: string
 *                   example: 65f2c9a1b12c3d0012ab45cd
 *
 *       400:
 *         description: Validation error or missing credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: MISSING_CREDENTIALS
 *
 *       401:
 *         description: Invalid credentials
 *
 *       404:
 *         description: Account not found
 *
 *       500:
 *         description: Internal server error
 */

UniCommerceRouter.post('/authToken', loginValidator, checkLanguage, login);

/**
 * @openapi
 * /productsCount:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get total published product count
 *     description: Returns count of published products for the authenticated seller.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Language preference
 *
 *       - in: query
 *         name: publishedStatus
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PUBLISHED]
 *         example: PUBLISHED
 *
 *     responses:
 *       200:
 *         description: Product count fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 125
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *       500:
 *         description: Internal server error
 */

UniCommerceRouter.get(
  '/productsCount',
  getProductCountValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  fetchProductCount
);

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get products list
 *     description: Returns paginated list of published products for the authenticated seller.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Language preference
 *
 *       - in: query
 *         name: pageNumber
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         example: 1
 *
 *       - in: query
 *         name: pageSize
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [50]
 *         example: 50
 *
 *       - in: query
 *         name: publishedStatus
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PUBLISHED]
 *         example: PUBLISHED
 *
 *       - in: query
 *         name: skus
 *         required: false
 *         schema:
 *           type: string
 *         example: KSY001_XS
 *
 *     responses:
 *       200:
 *         description: Products fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SuccessResponse"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *       500:
 *         description: Internal server error
 */
UniCommerceRouter.get(
  '/products',
  getProductsValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  fetchProducts
);

/**
 * @openapi
 * /updateInventory:
 *   post:
 *     tags: [UniCommerce]
 *     summary: Update inventory for products
 *     description: Updates inventory for one or more product variants for the authenticated seller.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: true
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Language preference
 *
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer access token obtained from Get Authentication API (format: "Authorization: Bearer &lt;token&gt;")
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inventoryList
 *             properties:
 *               inventoryList:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - productId
 *                     - variantId
 *                     - inventory
 *                   properties:
 *                     productId:
 *                       type: string
 *                       example: "979"
 *                     variantId:
 *                       type: string
 *                       example: "4726"
 *                     inventory:
 *                       oneOf:
 *                         - type: string
 *                         - type: number
 *                       example: 10
 *                     hsnCode:
 *                       type: string
 *                       example: "610910"
 *                     facilityCode:
 *                       type: string
 *                       example: "ChWhCode"
 *
 *     responses:
 *       200:
 *         description: Inventory update result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - failedProductList
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *                   example: SUCCESS
 *                 failedProductList:
 *                   type: array
 *                   description: Present when some or all SKUs fail
 *                   items:
 *                     type: object
 *                     required:
 *                       - productId
 *                       - variantId
 *                       - message
 *                     properties:
 *                       productId:
 *                         type: string
 *                         example: "979"
 *                       variantId:
 *                         type: string
 *                         example: "4726"
 *                       message:
 *                         type: string
 *                         example: Mismatch
 *
 *       400:
 *         description: Validation handled in Uniware format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [FAILED]
 *                   example: FAILED
 *                 failedProductList:
 *                   type: array
 *                   example:
 *                     - productId: "979"
 *                       variantId: "4726"
 *                       message: Validation failed
 *
 *       500:
 *         description: Internal error in Uniware format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: FAILED
 *                 failedProductList:
 *                   type: array
 */
UniCommerceRouter.post(
  '/updateInventory',
  updateInventoryValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  updateInventory
);
export default UniCommerceRouter;
