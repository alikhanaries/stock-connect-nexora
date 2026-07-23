import express from 'express';
import {
  listApiCallLogs,
  getApiCallLogByRequestId,
  getApiCallLogPerformance,
} from '#controllers/ApiCallLogController.js';
import { authMiddleware, authorize, checkLanguage } from '#middleware/index.js';
import { USER_ROLES } from '#constants/common.js';
import {
  listApiCallLogsValidator,
  getApiCallLogByRequestIdValidator,
  getApiCallLogPerformanceValidator,
} from '#validations/apiCallLogs.js';

const apiCallLogRoutes = express.Router();

/**
 * @swagger
 * tags:
 *   name: API Logs
 *   description: Master-admin API call audit and performance logs
 */

/**
 * @swagger
 * /admin/api-logs:
 *   get:
 *     tags: [API Logs]
 *     summary: List and filter API call logs
 *     description: Returns paginated API call logs from api_call_logs. Restricted to master_admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: size
 *         schema: { type: integer, default: 10, maximum: 200 }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD]
 *       - in: query
 *         name: path
 *         schema: { type: string }
 *         description: Case-insensitive partial match against the stored path
 *       - in: query
 *         name: statusCode
 *         schema: { type: integer }
 *       - in: query
 *         name: requestId
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *       - in: query
 *         name: integration
 *         schema: { type: string }
 *       - in: query
 *         name: isSlow
 *         schema: { type: boolean }
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, durationMs, statusCode, method, path]
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: API call logs fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SuccessResponse"
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 *       401:
 *         $ref: "#/components/schemas/FailResponse"
 *       403:
 *         $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */
apiCallLogRoutes.get(
  '/',
  listApiCallLogsValidator,
  checkLanguage,
  authMiddleware,
  authorize([USER_ROLES.MASTER_ADMIN]),
  listApiCallLogs
);

/**
 * @swagger
 * /admin/api-logs/performance:
 *   get:
 *     tags: [API Logs]
 *     summary: Get API call performance aggregates
 *     description: Returns volume, latency, error rate, and slow-request metrics. Restricted to master_admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD]
 *       - in: query
 *         name: path
 *         schema: { type: string }
 *       - in: query
 *         name: statusCode
 *         schema: { type: integer }
 *       - in: query
 *         name: requestId
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: sellerId
 *         schema: { type: string }
 *       - in: query
 *         name: integration
 *         schema: { type: string }
 *       - in: query
 *         name: isSlow
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: API call log performance fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SuccessResponse"
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 *       401:
 *         $ref: "#/components/schemas/FailResponse"
 *       403:
 *         $ref: "#/components/schemas/ErrorResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */
apiCallLogRoutes.get(
  '/performance',
  getApiCallLogPerformanceValidator,
  checkLanguage,
  authMiddleware,
  authorize([USER_ROLES.MASTER_ADMIN]),
  getApiCallLogPerformance
);

/**
 * @swagger
 * /admin/api-logs/{requestId}:
 *   get:
 *     tags: [API Logs]
 *     summary: Get a single API call log by requestId
 *     description: Returns the complete log document for the given requestId. Restricted to master_admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *           enum: [en, ar, zh-CN, tr]
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: API call log fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/SuccessResponse"
 *       400:
 *         $ref: "#/components/schemas/FailResponse"
 *       401:
 *         $ref: "#/components/schemas/FailResponse"
 *       403:
 *         $ref: "#/components/schemas/ErrorResponse"
 *       404:
 *         $ref: "#/components/schemas/FailResponse"
 *       500:
 *         $ref: "#/components/schemas/ErrorResponse"
 */
apiCallLogRoutes.get(
  '/:requestId',
  getApiCallLogByRequestIdValidator,
  checkLanguage,
  authMiddleware,
  authorize([USER_ROLES.MASTER_ADMIN]),
  getApiCallLogByRequestId
);

export default apiCallLogRoutes;
