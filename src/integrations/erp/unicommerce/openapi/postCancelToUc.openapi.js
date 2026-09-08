/**
 * Outbound UniCommerce API invoked by StockConnect after marketplace cancellation.
 * Official docs: https://documentation.unicommerce.com/docs/post_cancel_to_uc.html
 *
 * StockConnect calls this automatically (fire-and-forget) when:
 * - PUT /orders/cancelFullOrder
 * - PUT /orders/cancelPartialOrder
 * - PATCH /orders/merchant-cancellation
 *
 * Requires env: UNICOMMERCE_GENERIC_PROXY_URL, UNICOMMERCE_CLIENT_ID,
 * UNICOMMERCE_MERCHANT_ID, UNICOMMERCE_SECURITY_KEY
 *
 * @openapi
 * components:
 *   schemas:
 *     UniwarePostCancelRequest:
 *       type: object
 *       required:
 *         - saleOrderCode
 *         - cancelledSkuCodes
 *         - cancellationReason
 *       properties:
 *         saleOrderCode:
 *           type: string
 *           description: Order code (same as GET /erp/unicommerce/orders `code` — channelOrderNumber or orderId)
 *           example: "ORD-12345"
 *         cancelledSkuCodes:
 *           type: array
 *           description: Cancelled items in this cancellation event (supports partial cancellation)
 *           items:
 *             type: object
 *             required:
 *               - quantity
 *               - productId
 *               - variantId
 *             properties:
 *               quantity:
 *                 type: number
 *                 description: Quantity cancelled in this request
 *                 example: 2
 *               productId:
 *                 type: string
 *                 description: Parent product ID (same mapping as order export productId)
 *                 example: "679a1b2c3d4e5f6789012345"
 *               variantId:
 *                 type: string
 *                 description: Variant SKU (merchantProductNo)
 *                 example: "SKU-4726"
 *         cancellationReason:
 *           type: string
 *           example: "Customer requested cancellation"
 *     UniwarePostCancelResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [success, failure]
 *           example: success
 *         message:
 *           type: string
 *           example: Successfully updated Order detail
 *         data:
 *           type: string
 *           nullable: true
 *           example: null
 *
 * /uc/v1/order/cancel:
 *   post:
 *     servers:
 *       - url: https://genericproxy.unicommerce.com
 *         description: UniCommerce Generic Proxy (outbound from StockConnect)
 *     tags: [UniCommerce Outbound]
 *     summary: Post Cancel to UC (outbound)
 *     description: |
 *       Optional outbound API. StockConnect POSTs to UniCommerce when a seller/customer
 *       cancels on the marketplace. Not exposed as a StockConnect route — invoked internally
 *       by `uniwareCancelService` after successful marketplace cancellation.
 *
 *       **Field mapping (StockConnect → UniCommerce):**
 *       - saleOrderCode = order.channelOrderNumber || String(order.orderId)
 *       - productId = buildProductIdBySku(merchantProductNo) || channelProductNo
 *       - variantId = merchantProductNo
 *       - quantity = qty cancelled in the current event (not original order qty when partial)
 *
 *       See https://documentation.unicommerce.com/docs/post_cancel_to_uc.html
 *     parameters:
 *       - in: header
 *         name: Content-Type
 *         required: true
 *         schema:
 *           type: string
 *           example: application/json
 *       - in: header
 *         name: clientid
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID provided by UniCommerce
 *       - in: header
 *         name: merchantid
 *         required: true
 *         schema:
 *           type: string
 *         description: UniCommerce username (UNICOMMERCE_MERCHANT_ID)
 *       - in: header
 *         name: securitykey
 *         required: true
 *         schema:
 *           type: string
 *         description: Security key provided by UniCommerce
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UniwarePostCancelRequest'
 *           example:
 *             saleOrderCode: "ORD-12345"
 *             cancelledSkuCodes:
 *               - quantity: 2
 *                 productId: "679a1b2c3d4e5f6789012345"
 *                 variantId: "SKU-4726"
 *             cancellationReason: "Customer requested cancellation"
 *     responses:
 *       200:
 *         description: Cancellation acknowledged by UniCommerce
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UniwarePostCancelResponse'
 *             example:
 *               status: success
 *               message: Successfully updated Order detail
 *               data: null
 */

export {};
