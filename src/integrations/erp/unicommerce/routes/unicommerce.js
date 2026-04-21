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
import { ordersController, orderDispatch, cancelOrder } from '../controllers/orderController.js';
import { orderCancelValidator, orderDispatchValidator, ordersValidator } from '../validations/orders.js';
import { updateInventoryValidator } from '../validations/inventory.js';
import { updateInventory } from '../controllers/inventoryController.js';
import { getCourierDetailsValidator, getLabelsValidator } from '../validations/shipment.js';
import { getCourierDetails, getLabels } from '../controllers/shipmentController.js';

const UniCommerceRouter = express.Router();

/**
 * @openapi
 * /erp/unicommerce/authToken:
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
 * /erp/unicommerce/productsCount:
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
 * /erp/unicommerce/products:
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
 * /erp/unicommerce/updateInventory:
 *   post:
 *     tags:
 *       - UniCommerce
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
 *         description: Bearer access token obtained from Get Authentication API
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
 *
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
 *                       type: number
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

/**
 * @openapi
 * /erp/unicommerce/orders:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get Orders or Order Status
 *     description: |
 *       This endpoint supports two use cases for Uniware OMS:
 *
 *       **1. Get Orders API**
 *       Fetch new marketplace orders.
 *       Requires: `orderDateFrom`, `orderDateTo`, `orderStatus`
 *       `pageSize` must be **50**
 *
 *       **2. Get Order Status API**
 *       Fetch the latest status of an existing order.
 *       Requires: `orderIds`
 *       `pageSize` must be **5**
 *
 *       The behavior is determined by the query parameters provided.
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
 *         description: Authorization header in the format "Bearer <access token>"
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
 *           enum: [5, 50]
 *         example: 50
 *         description: |
 *           50 → Get Orders API
 *           5 → Get Order Status API
 *
 *       - in: query
 *         name: orderDateFrom
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         example: 2025-11-26T00:00:00+00:00
 *         description: Required for Get Orders API
 *
 *       - in: query
 *         name: orderDateTo
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *         example: 2025-11-30T23:59:59+00:00
 *         description: Required for Get Orders API
 *
 *       - in: query
 *         name: orderStatus
 *         required: false
 *         schema:
 *           type: string
 *           enum: [CREATED, PENDING_VERIFICATION]
 *         example: CREATED
 *         description: Required for Get Orders API
 *
 *       - in: query
 *         name: orderIds
 *         required: false
 *         schema:
 *           type: string
 *         example: ORD12345
 *         description: Required for Get Order Status API
 *
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *
 *       500:
 *         description: Internal server error
 */
UniCommerceRouter.get(
  '/orders',
  ordersValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  ordersController
);
/**
 * @openapi
 * /erp/unicommerce/orders/dispatch:
 *   post:
 *     tags: [UniCommerce]
 *     summary: Dispatch Order Items
 *     description: Mark order items as dispatched and create shipment for Uniware OMS.
 *
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
 *         name: accessToken
 *         required: true
 *         schema:
 *           type: string
 *         description: Access token received from authentication API
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderItems
 *               - selfShipping
 *             properties:
 *               orderItems:
 *                 type: array
 *                 description: List of order items to dispatch
 *                 items:
 *                   type: object
 *                   required:
 *                     - orderItemId
 *                     - quantity
 *                   properties:
 *                     orderItemId:
 *                       type: string
 *                       description: Order Item ID
 *                       example: "47123"
 *
 *                     quantity:
 *                       type: integer
 *                       description: Quantity to dispatch
 *                       example: 1
 *
 *               selfShipping:
 *                 type: object
 *                 required:
 *                   - trackingId
 *                 properties:
 *                   deliveryPartner:
 *                     type: string
 *                     description: Courier or delivery partner name
 *                     example: DHL
 *
 *                   dispatchDate:
 *                     type: string
 *                     format: date-time
 *                     description: Dispatch date of shipment
 *                     example: 2026-03-06T10:30:00Z
 *
 *                   invoiceNumber:
 *                     type: string
 *                     description: Invoice number for shipment
 *                     example: INV-1001
 *
 *                   trackingId:
 *                     type: string
 *                     description: Shipment tracking ID / AWB number
 *                     example: AWB123456789
 *
 *                   trackingURL:
 *                     type: string
 *                     description: Shipment tracking URL
 *                     example: https://tracking.dhl.com/AWB123456789
 *
 *     responses:
 *       200:
 *         description: Dispatch processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status of the request
 *                   enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *                   example: SUCCESS
 *
 *                 orderItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderItemId:
 *                         type: string
 *                         description: Order item ID processed
 *                         example: "47123"
 *
 *                       errorMessage:
 *                         type: string
 *                         description: Error message if dispatch failed
 *                         example: ""
 *
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *
 *       500:
 *         description: Internal server error
 */

UniCommerceRouter.post(
  '/orders/dispatch',
  orderDispatchValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  orderDispatch
);

/**
 * @openapi
 * /erp/unicommerce/orders/cancel:
 *   post:
 *     tags: [UniCommerce]
 *     summary: Cancel Order Items
 *     description: Notify marketplace when seller cancels order items in Uniware.
 *
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
 *         description: Bearer access token (Authorization: Bearer token)
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - orderItems
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID to cancel
 *                 example: ORD12345
 *
 *               orderItems:
 *                 type: array
 *                 description: List of cancelled order items
 *                 items:
 *                   type: object
 *                   required:
 *                     - orderItemId
 *                     - productId
 *                     - variantId
 *                     - quantity
 *                   properties:
 *                     orderItemId:
 *                       type: string
 *                       example: "47123"
 *
 *                     productId:
 *                       type: string
 *                       example: "979"
 *
 *                     variantId:
 *                       type: string
 *                       example: "4726"
 *
 *                     quantity:
 *                       type: number
 *                       example: 2
 *
 *     responses:
 *       200:
 *         description: Cancellation processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *                   example: SUCCESS
 *
 *                 orderItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderItemId:
 *                         type: string
 *                         example: "47123"
 *
 *                       errorMessage:
 *                         type: string
 *                         example: order Item Id not available
 *
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *
 *       500:
 *         description: Internal server error
 */

UniCommerceRouter.post(
  '/orders/cancel',
  orderCancelValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  cancelOrder
);

/**
 * @openapi
 * /erp/unicommerce/orders/labels:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get Labels
 *     description: |
 *       Fetches the shipping label (and optionally invoice/pack-slip) as a base64 encoded string
 *       for marketplace-allocated logistics. Used by Uniware to print labels.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer access token obtained from Get Authentication API
 *       - in: query
 *         name: orderItemIds
 *         required: true
 *         schema:
 *           type: string
 *         example: abc123,abc456
 *         description: Comma-separated list of order item IDs
 *     responses:
 *       200:
 *         description: Label fetched successfully as base64 encoded string
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: JVBERi0xLjMKM........
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
UniCommerceRouter.get(
  '/orders/labels',
  getLabelsValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  getLabels
);

/**
 * @openapi
 * /erp/unicommerce/courierDetails:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get Courier Details
 *     description: |
 *       Fetches the courier details for marketplace-shipped orders.
 *       Returns the shipper name and AWB number (tracking number) used to generate labels in Uniware.
 *       This API is used only when orders are shipped by the marketplace.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Preferred response language
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer access token obtained from Get Authentication API
 *       - in: query
 *         name: orderItemIds
 *         required: true
 *         schema:
 *           type: string
 *         example: abc123,abc456
 *         description: Comma-separated list of order item IDs
 *     responses:
 *       200:
 *         description: Courier details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 awbNo:
 *                   type: string
 *                   description: Airway bill number (shipment tracking number)
 *                   example: IPX509924343
 *                 status:
 *                   type: string
 *                   description: Courier availability status
 *                   enum: [AVAILABLE, SELLER_SHIPPING, COURIER_NOT_ASSIGNED]
 *                   example: AVAILABLE
 *                 courierCode:
 *                   type: string
 *                   description: Code of shipping provider
 *                   example: widect
 *                 courierName:
 *                   type: string
 *                   description: Name of shipping provider
 *                   example: Widect
 *                 additionalInfo:
 *                   type: string
 *                   description: Any additional information
 *                   example: ""
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
  '/courierDetails',
  getCourierDetailsValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  getCourierDetails
);

export default UniCommerceRouter;
