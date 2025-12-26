import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import {
  createShipment,
  getAllShipments,
  ayMakanWebHook,
  getSingleShipment,
  cancelShipment,
  createManualShipment,
} from '#root/src/controllers/ShipmentController.js';
import { authMiddleware, verifySellerAccess } from '#middleware/index.js';
import {
  getShipmentValidator,
  createShipmentValidator,
  getSingleShipmentValidator,
  cancelShipmentValidator,
  createManualShipmentValidator,
} from '#validations/shipment.js';

const router = express.Router();
// CREATE SHIPMENT
/**
 * @swagger
 * tags:
 *   name: Shipments
 *   description: Shipment management APIs
 */

/**
 * @swagger
 * /shipment/createShipment:
 *   post:
 *     tags: [Shipments]
 *     summary: Create a new shipment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: string }
 *               sellerId: { type: string }
 *               pickUpId: { type: string }
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     orderLineId: { type: string }
 *                     merchantProductNo: { type: string }
 *                     quantity: { type: number }
 *                     lineTotalInclVat: { type: number }
 *                     hsCode: { type: string }
 *               pieces: { type: number }
 *               codAmount: { type: number }
 *               currency: { type: string }
 *             required: [id, sellerId, pickUpId, products]
 *     responses:
 *       201: { description: "Shipment created successfully" }
 *       400: { description: "Validation failed" }
 */
router.post('/createShipment', createShipmentValidator, checkLanguage, authMiddleware, createShipment);

// GET ALL SHIPMENT
/**
 * @swagger
 * /shipment/getAllShipments:
 *   get:
 *     tags: [Shipments]
 *     summary: Get all shipments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: size
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Shipments fetched successfully" }
 *       400: { description: "Bad request" }
 */
router.get(
  '/getAllShipments',
  getShipmentValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getAllShipments
);

// WEBHOOK FOR AYMAKAN
/**
 * @swagger
 * /shipment/ayMakanWebHook:
 *   post:
 *     tags: [Shipments]
 *     summary: Receive Aymakan webhook
 *     security:
 *       - webhookAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tracking_number: { type: string }
 *               status: { type: string }
 *               extra: { type: object }
 *             required: [tracking_number, status]
 *     responses:
 *       200: { description: "Shipment updated" }
 *       400: { description: "Invalid payload" }
 */
router.post('/ayMakanWebHook', ayMakanWebHook);

// GET SINGLE SHIPMENT
/**
 * @swagger
 * /shipment/getSingleShipment/{id}:
 *   get:
 *     tags: [Shipments]
 *     summary: Get a single shipment by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     responses:
 *       200: { description: "Shipment found" }
 *       404: { description: "Shipment not found" }
 */
router.get('/getSingleShipment/:id', getSingleShipmentValidator, checkLanguage, authMiddleware, getSingleShipment);

// CANCEL SHIPMENT
/**
 * @swagger
 * /shipment/cancelShipment:
 *   post:
 *     tags: [Shipments]
 *     summary: Cancel a shipment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shipmentId: { type: string }
 *               reason: { type: string }
 *             required: [shipmentId, reason]
 *     responses:
 *       200: { description: "Shipment cancelled successfully" }
 *       404: { description: "Shipment not found" }
 */
router.post('/cancelShipment', cancelShipmentValidator, checkLanguage, authMiddleware, cancelShipment);

// CREATE MANUAL SHIPMENT
/**
 * @swagger
 * /shipment/createManualShipment:
 *   post:
 *     tags: [Shipments]
 *     summary: Create a manual shipment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Accept-Language
 *         schema: { type: string, enum: [en, ar, zh-CN, tr] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: string }
 *               sellerId: { type: string }
 *               pickUpId: { type: string }
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     orderLineId: { type: string }
 *                     merchantProductNo: { type: string }
 *                     quantity: { type: number }
 *                     lineTotalInclVat: { type: number }
 *                     hsCode: { type: string }
 *               pieces: { type: number }
 *               codAmount: { type: number }
 *               currency: { type: string }
 *             required: [id, sellerId, pickUpId, products]
 *     responses:
 *       201: { description: "Manual shipment created successfully" }
 *       400: { description: "Validation failed" }
 */
router.post(
  '/createManualShipment',
  createManualShipmentValidator,
  checkLanguage,
  authMiddleware,
  createManualShipment
);

export default router;
