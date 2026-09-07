import express from 'express';
import { unicommerceAuthMiddleware } from '#root/src/integrations/erp/unicommerce/middleware/authMiddleware.js';
import { verifyUnicommerceSellerAccess } from '#root/src/integrations/erp/unicommerce/middleware/verifySellerAccessMiddleware.js';
import {
  fetchProductCount,
  fetchProducts,
} from '#root/src/integrations/erp/unicommerce/controllers/productController.js';
import { login } from '#root/src/integrations/erp/unicommerce/controllers/authController.js';
import { loginValidator, loginQueryValidator } from '#root/src/integrations/erp/unicommerce/validations/auth.js';
import { checkLanguage } from '#middleware/index.js';
import { getProductCountValidator, getProductsValidator } from '../validations/products.js';
import { ordersController, orderDispatch, cancelOrder } from '../controllers/orderController.js';
import { orderCancelValidator, orderDispatchValidator, ordersValidator } from '../validations/orders.js';
import { updateInventoryValidator } from '../validations/inventory.js';
import { updateInventory } from '../controllers/inventoryController.js';
import { getCourierDetailsValidator, getLabelsQueryValidator, postLabelsValidator } from '../validations/shipment.js';
import { getCourierDetails, getLabels, postShipmentDetails } from '../controllers/shipmentController.js';
import { createShipment } from '#root/src/controllers/ShipmentController.js';
import { createShipmentValidator } from '#validations/shipment.js';
import { partnerJsonBodyMiddleware } from '../middleware/jsonBodyParser.js';

const UniCommerceRouter = express.Router();

/**
 * @openapi
 * /erp/unicommerce/authToken:
 *   get:
 *     tags: [UniCommerce]
 *     summary: Get Authentication
 *     description: |
 *       Official Uniware contract. Validates seller credentials and returns an access token
 *       for use in the apiKey header on subsequent API requests.
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Seller username
 *       - in: query
 *         name: password
 *         required: true
 *         schema:
 *           type: string
 *         description: Seller password
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, accessToken]
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [SUCCESS, FAILED]
 *                   example: SUCCESS
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Validation error or missing credentials
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 *   post:
 *     tags: [UniCommerce]
 *     summary: Post Authentication
 *     description: |
 *       Alternate POST variant with credentials in the JSON request body.
 *       Allowed Content-Type values are application/json, application/*+json, and text/plain.
 *       Request body must not exceed 64kb.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *         description: Preferred response language
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
 *         text/plain:
 *           schema:
 *             type: string
 *             example: '{"username":"seller@example.com","password":"Test@123"}'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status, accessToken]
 *               properties:
 *                 status:
 *                   type: string
 *                   example: SUCCESS
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Validation error or missing credentials
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: Account not found
 *       413:
 *         description: Request body exceeds 64kb limit
 *       415:
 *         description: Unsupported Content-Type
 *       500:
 *         description: Internal server error
 */

UniCommerceRouter.get('/authToken', loginQueryValidator, checkLanguage, login);
UniCommerceRouter.post('/authToken', ...partnerJsonBodyMiddleware, loginValidator, checkLanguage, login);

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
 *       - in: header
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *       - in: header
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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
 *       Fetches label or label with channel-invoice/pack-slip as a base64 encoded string.
 *       Required only when orders are shipped by marketplace-allocated logistics.
 *       See https://documentation.unicommerce.com/docs/getlabels.html
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: header
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
 *       - in: query
 *         name: orderItemIds
 *         required: true
 *         schema:
 *           type: string
 *         example: abc123,abc456
 *         description: Item ID or Item IDs (comma separated). For multiple order items send all IDs separated by comma.
 *     responses:
 *       200:
 *         description: Base64 encoded label string (convert to PDF for printing)
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: JVBERi0xLjMKM........
 *       400:
 *         description: Validation error
 *       404:
 *         description: Label not found
 *       500:
 *         description: Internal server error
 *   post:
 *     tags: [UniCommerce]
 *     summary: Post Shipment Details
 *     description: |
 *       Uniware posts shipment data (box dimensions, invoice/tax per item) before label generation.
 *       Returns acknowledgement per order item. See https://documentation.unicommerce.com/docs/postlabels.html
 *       Allowed Content-Type values are application/json, application/*+json, and text/plain.
 *       Request body must not exceed 64kb.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         required: false
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: header
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderItems
 *             properties:
 *               boxHeight:
 *                 type: number
 *                 example: 0
 *               boxLength:
 *                 type: number
 *                 example: 0
 *               boxWidth:
 *                 type: number
 *                 example: 0
 *               weight:
 *                 type: number
 *                 example: 0
 *               orderItems:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - orderItemId
 *                   properties:
 *                     orderItemId:
 *                       type: string
 *                       example: "47123"
 *                     invoiceNumber:
 *                       type: string
 *                       example: INV-1001
 *                     invoiceDate:
 *                       type: string
 *                       format: date
 *                       example: 2017-01-02
 *                     taxRate:
 *                       type: number
 *                       example: 0
 *                     centralGstPercentage:
 *                       type: number
 *                       example: 6
 *                     compensationCessPercentage:
 *                       type: number
 *                       example: 0
 *                     integratedGstPercentage:
 *                       type: number
 *                       example: 12
 *                     stateGstPercentage:
 *                       type: number
 *                       example: 6
 *                     unionTerritoryGstPercentage:
 *                       type: number
 *                       example: 0
 *     responses:
 *       200:
 *         description: Shipment details acknowledgement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *                 orderItems:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderItemId:
 *                         type: string
 *                       errorMessage:
 *                         type: string
 *       400:
 *         description: Validation error
 *       413:
 *         description: Request body exceeds 64kb limit
 *       415:
 *         description: Unsupported Content-Type
 *       500:
 *         description: Internal server error
 */
UniCommerceRouter.get(
  '/orders/labels',
  getLabelsQueryValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  getLabels
);

UniCommerceRouter.post(
  '/orders/labels',
  ...partnerJsonBodyMiddleware,
  postLabelsValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  postShipmentDetails
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
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
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

/**
 * @openapi
 * /erp/unicommerce/createShipment:
 *   post:
 *     tags: [UniCommerce]
 *     summary: Create a shipment
 *     description: |
 *       Creates a shipment for the authenticated seller using the internal shipment-creation flow.
 *       Mirrors the body of `POST /shipment/createShipment`.
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
 *       - in: header
 *         name: apiKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Raw access token obtained from Get Authentication API (sent as-is, no "Bearer" prefix)
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - sellerId
 *               - pickUpId
 *               - products
 *             properties:
 *               id:
 *                 type: string
 *                 description: Order ID for which the shipment is created
 *                 example: ORD12345
 *               sellerId:
 *                 type: string
 *                 description: Seller ID
 *                 example: 65f2c9a1b12c3d0012ab45cd
 *               pickUpId:
 *                 type: string
 *                 description: Pickup location ID
 *                 example: PU98765
 *               products:
 *                 type: array
 *                 description: Line items to ship
 *                 items:
 *                   type: object
 *                   required:
 *                     - orderLineId
 *                     - merchantProductNo
 *                     - quantity
 *                   properties:
 *                     orderLineId:
 *                       type: string
 *                       example: "47123"
 *                     merchantProductNo:
 *                       type: string
 *                       example: KSY001_XS
 *                     quantity:
 *                       type: number
 *                       example: 1
 *                     lineTotalInclVat:
 *                       type: number
 *                       example: 199.99
 *                     hsCode:
 *                       type: string
 *                       example: "610910"
 *               pieces:
 *                 type: number
 *                 description: Total number of pieces in the shipment
 *                 example: 1
 *               codAmount:
 *                 type: number
 *                 description: Cash-on-delivery amount, if applicable
 *                 example: 0
 *               currency:
 *                 type: string
 *                 description: Currency code
 *                 example: SAR
 *
 *     responses:
 *       201:
 *         description: Shipment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: SUCCESS
 *                 message:
 *                   type: string
 *                   example: Shipment created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     shipmentId:
 *                       type: string
 *                       example: SHIP-9001
 *
 *       400:
 *         description: Validation failed or shipment could not be created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/FailResponse"
 *
 *       401:
 *         description: Unauthorized
 *
 *       500:
 *         description: Internal server error
 */
UniCommerceRouter.post(
  '/createShipment',
  createShipmentValidator,
  unicommerceAuthMiddleware,
  verifyUnicommerceSellerAccess,
  createShipment
);

export default UniCommerceRouter;
