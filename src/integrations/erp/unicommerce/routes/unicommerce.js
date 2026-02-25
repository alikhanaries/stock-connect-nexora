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
import { getProductsValidator } from '../validations/products.js';

const UniCommerceRouter = express.Router();

UniCommerceRouter.get('/productsCount', unicommerceAuthMiddleware, verifyUnicommerceSellerAccess, fetchProductCount);
UniCommerceRouter.post('/authToken', loginValidator, checkLanguage, login);

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
export default UniCommerceRouter;
