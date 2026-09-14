/**
 * StockConnect marketplace routes that fire outbound UniCommerce Generic Proxy calls.
 * These are NOT Uniware inbound endpoints; documented here for integration completeness.
 *
 * @openapi
 * /orders/cancelFullOrder:
 *   put:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: Cancel full order (triggers Post Cancel to UC)
 *     description: |
 *       StockConnect seller-scoped full cancellation (PUT /api/orders/cancelFullOrder).
 *       On success, optionally notifies UniCommerce outbound POST /uc/v1/order/cancel
 *       when UNICOMMERCE_GENERIC_PROXY_URL, UNICOMMERCE_CLIENT_ID,
 *       UNICOMMERCE_MERCHANT_ID, and UNICOMMERCE_SECURITY_KEY are configured.
 *       OCP orders are excluded.
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
 *             type: object
 *             required: [orderId, reason]
 *             properties:
 *               orderId:
 *                 type: string
 *               reason:
 *                 type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order cancelled; outbound UC notify may run fire-and-forget
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/FailResponse'
 *
 * /orders/cancelPartialOrder:
 *   put:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: Cancel partial order (triggers Post Cancel to UC)
 *     description: |
 *       Item-wise cancellation (PUT /api/orders/cancelPartialOrder).
 *       On success, optionally notifies UniCommerce outbound POST /uc/v1/order/cancel
 *       with only the SKUs/quantities cancelled in this request.
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
 *             type: object
 *             required: [orderId, reason, products]
 *             properties:
 *               orderId:
 *                 type: string
 *               reason:
 *                 type: string
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [orderLineId, merchantProductNo, quantity]
 *                   properties:
 *                     orderLineId:
 *                       type: string
 *                     merchantProductNo:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Partial cancellation processed; outbound UC notify may run
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/FailResponse'
 *
 * /orders/merchant-cancellation:
 *   patch:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: Merchant full cancel by ID (triggers Post Cancel to UC)
 *     description: |
 *       Master-admin/merchant cancellation (PATCH /api/orders/merchant-cancellation).
 *       On success, optionally notifies UniCommerce outbound POST /uc/v1/order/cancel.
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
 *             type: object
 *             required: [orderId, reason]
 *             properties:
 *               orderId:
 *                 type: string
 *               reason:
 *                 type: string
 *               specifics:
 *                 type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *
 * /returns/fetchReturnsWebhook:
 *   post:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: CE returns webhook (may trigger Post Return to UC)
 *     description: |
 *       ChannelEngine returns webhook ingress (POST /api/returns/fetchReturnsWebhook).
 *       When new customer returns are persisted, StockConnect may fire outbound
 *       POST /uc/v1/returns with type CUSTOMER_RETURN (fire-and-forget).
 *     security:
 *       - webhookAuth: []
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Missing webhook authentication header
 *       403:
 *         description: Invalid webhook authentication
 *
 * /orders/channelengine-webhook:
 *   post:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: CE order webhook POST (may trigger Post Return to UC on RTO)
 *     description: |
 *       ChannelEngine order create/change webhook (POST /api/orders/channelengine-webhook).
 *       During order sync, lines transitioning to RETURNED without a customer return record
 *       may batch-notify UniCommerce outbound POST /uc/v1/returns with
 *       type COURIER_RETURN (grouped by order + seller + AWB).
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook processed
 *   get:
 *     tags: [UniCommerce Marketplace Triggers]
 *     summary: CE order webhook GET (notification ping)
 *     description: |
 *       ChannelEngine notification ping (GET /api/orders/channelengine-webhook).
 *       Same handler as POST; may trigger order sync side-effects including RTO return notify.
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook processed
 */

export {};
