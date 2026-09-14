/**
 * Shared OpenAPI components for UniCommerce integration docs.
 * Loaded by loadUniCommerceSwagger() via the unicommerce integrations glob.
 *
 * @openapi
 * components:
 *   schemas:
 *     UniwareAuthTokenResponse:
 *       type: object
 *       required: [status, accessToken]
 *       properties:
 *         status:
 *           type: string
 *           enum: [SUCCESS, FAILED]
 *           example: SUCCESS
 *         accessToken:
 *           type: string
 *           description: JWT sent as raw apiKey header on subsequent requests
 *           example: your-access-token
 *
 *     UniwareOrderItemResult:
 *       type: object
 *       required: [orderItemId, errorMessage]
 *       properties:
 *         orderItemId:
 *           type: string
 *           example: "47123"
 *         errorMessage:
 *           type: string
 *           description: Empty string when the item succeeded
 *           example: ""
 *
 *     UniwareOrderItemsStatusResponse:
 *       type: object
 *       required: [status, orderItems]
 *       properties:
 *         status:
 *           type: string
 *           enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *           example: SUCCESS
 *         orderItems:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UniwareOrderItemResult'
 *
 *     UniwareInventoryFailure:
 *       type: object
 *       required: [productId, variantId, message]
 *       properties:
 *         productId:
 *           type: string
 *         variantId:
 *           type: string
 *         message:
 *           type: string
 *
 *     UniwareInventoryUpdateResponse:
 *       type: object
 *       required: [status, failedProductList]
 *       properties:
 *         status:
 *           type: string
 *           enum: [SUCCESS, FAILED, PARTIAL_SUCCESS]
 *         failedProductList:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UniwareInventoryFailure'
 *
 *     UniwareCourierDetailsResponse:
 *       type: object
 *       properties:
 *         awbNo:
 *           type: string
 *           example: IPX509924343
 *         status:
 *           type: string
 *           enum: [AVAILABLE, SELLER_SHIPPING, COURIER_NOT_ASSIGNED]
 *           example: AVAILABLE
 *         courierCode:
 *           type: string
 *           example: widect
 *         courierName:
 *           type: string
 *           example: Widect
 *         additionalInfo:
 *           type: string
 *           example: ""
 *
 *     UniwarePostShipmentDetailsRequest:
 *       type: object
 *       required: [orderItems]
 *       properties:
 *         boxHeight:
 *           type: number
 *           description: Box height in millimeters
 *           example: 100
 *         boxLength:
 *           type: number
 *           description: Box length in millimeters
 *           example: 200
 *         boxWidth:
 *           type: number
 *           description: Box width in millimeters
 *           example: 150
 *         weight:
 *           type: number
 *           description: Weight in grams
 *           example: 500
 *         orderItems:
 *           type: array
 *           minItems: 1
 *           description: |
 *             Same orderItemId may appear multiple times when quantity > 1 (one entry per unit).
 *           items:
 *             type: object
 *             required: [orderItemId, invoiceNumber, invoiceDate]
 *             properties:
 *               orderItemId:
 *                 type: string
 *                 description: CE order line id (= orderSkuList.skuList.id)
 *                 example: "47123"
 *               invoiceNumber:
 *                 type: string
 *                 example: INV-1001
 *               invoiceDate:
 *                 type: string
 *                 format: date
 *                 example: 2017-01-02
 *               taxRate:
 *                 type: number
 *               centralGstPercentage:
 *                 type: number
 *               compensationCessPercentage:
 *                 type: number
 *               integratedGstPercentage:
 *                 type: number
 *               stateGstPercentage:
 *                 type: number
 *               unionTerritoryGstPercentage:
 *                 type: number
 */

export {};
