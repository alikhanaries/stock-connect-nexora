import express from 'express';
import { translateProductField, getTranslateProgress } from '#controllers/GeminiController.js';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { translateProductFieldValidator } from '#validations/products.js';

const geminiRouter = express.Router();

/**
 * @openapi
 * /gemini/translate-field:
 *   post:
 *     tags: [Gemini]
 *     summary: Translate product field(s) for all products of a seller using Gemini AI
 *     description: Auto-detects source language per field and skips fields already in the target language. Runs in the background.
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *         example: 692ff269d38670a5807918ac
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [translate]
 *             properties:
 *               translate:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [field, lang]
 *                   properties:
 *                     field:
 *                       type: string
 *                       example: nameAr
 *                     lang:
 *                       type: string
 *                       example: en
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       400: { $ref: "#/components/schemas/FailResponse" }
 *       403: { $ref: "#/components/schemas/FailResponse" }
 */
geminiRouter.post(
  '/translate-field',
  translateProductFieldValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  translateProductField
);

/**
 * @openapi
 * /gemini/translate-progress:
 *   get:
 *     tags: [Gemini]
 *     summary: Get translation progress for the current seller
 *     parameters:
 *       - in: query
 *         name: sellerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/SuccessResponse" }
 *       404: { $ref: "#/components/schemas/FailResponse" }
 */
geminiRouter.get('/translate-progress', checkLanguage, authMiddleware, verifySellerAccess, getTranslateProgress);

export default geminiRouter;
