/**
 * Outbound UniCommerce API invoked by StockConnect when a return is created or an RTO is detected.
 * Official docs: https://documentation.unicommerce.com/docs/post_return_to_uc.html
 *
 * StockConnect calls this automatically (fire-and-forget) when:
 * - A new ChannelEngine return is saved (`CUSTOMER_RETURN`)
 * - An order line transitions to RETURNED without a customer return record (`COURIER_RETURN`)
 *
 * Requires env: UNICOMMERCE_GENERIC_PROXY_URL, UNICOMMERCE_CLIENT_ID,
 * UNICOMMERCE_MERCHANT_ID, UNICOMMERCE_SECURITY_KEY, STOCK_LOCATION
 *
 * @openapi
 * components:
 *   schemas:
 *     UniwarePostReturnRequest:
 *       type: object
 *       required:
 *         - saleOrderCode
 *         - returnID
 *         - type
 *         - status
 *         - orderItems
 *       properties:
 *         saleOrderCode:
 *           type: string
 *           description: Same Uniware sale order code as GET /erp/unicommerce/orders `code`
 *         reason:
 *           type: string
 *         trackingNumber:
 *           type: string
 *         returnID:
 *           type: string
 *           description: ChannelEngine return ID for CUSTOMER_RETURN
 *         returnWarehouseCode:
 *           type: string
 *           description: STOCK_LOCATION env value
 *         shippingProviderCode:
 *           type: string
 *           example: CHANNEL_SHIPPING
 *         type:
 *           type: string
 *           enum: [CUSTOMER_RETURN, COURIER_RETURN]
 *         status:
 *           type: string
 *           enum: [CREATED]
 *         IsReverse:
 *           type: boolean
 *           example: true
 *         orderItems:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - channelProductId
 *               - quantity
 *             properties:
 *               channelProductId:
 *                 type: string
 *                 description: Uniware ProductId-VariantId from Get Products (`${parentProductMongoId}-${productSkuCode}`)
 *               quantity:
 *                 type: number
 *         createdOn:
 *           type: string
 *           example: "2026-09-08 16:35:00"
 *
 * /uc/v1/returns:
 *   post:
 *     servers:
 *       - url: https://genericproxy.unicommerce.com
 *         description: UniCommerce Generic Proxy (outbound from StockConnect)
 *     tags: [UniCommerce Outbound]
 *     summary: Post Return to UC (outbound)
 *     description: |
 *       Optional outbound API. StockConnect POSTs to UniCommerce when:
 *       - **CUSTOMER_RETURN** — new CE return saved in StockConnect
 *       - **COURIER_RETURN** — order line marked RETURNED without a customer return record (RTO)
 *
 *       **Field mapping (StockConnect → UniCommerce):**
 *       - saleOrderCode = order.channelOrderNumber || String(order.orderId)
 *       - channelProductId = `${buildProductIdBySku(sku)}-${productSkuCode}` (same as Get Products parent id + variant SKU)
 *       - returnID = Return.returnId (CE return ID) for CUSTOMER_RETURN
 *       - returnID = RTO-{orderId}-{airWaybillNo} for COURIER_RETURN when AWB is available
 *       - returnID = RTO-{orderId} for COURIER_RETURN when AWB is missing
 *       - COURIER_RETURN lines from the same order + seller + AWB are batched into one orderItems[] array
 *       - returnWarehouseCode = STOCK_LOCATION
 *       - shippingProviderCode = CHANNEL_SHIPPING
 *       - status = CREATED
 *       - IsReverse = true
 *
 *       See https://documentation.unicommerce.com/docs/post_return_to_uc.html
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
 *       - in: header
 *         name: merchantid
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: securitykey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UniwarePostReturnRequest'
 *     responses:
 *       200:
 *         description: Return acknowledged by UniCommerce
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 */

export {};
