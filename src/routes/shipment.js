import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import {
  createShipment,
  getAllShipments,
  ayMakanWebHook,
  getSingleShipment,
  cancelShipment,
} from '#root/src/controllers/ShipmentController.js';
import { authMiddleware, verifySellerAccess, webHookAuthMiddleware } from '#middleware/index.js';
import {
  getShipmentValidator,
  createShipmentValidator,
  ayMakanWebHookValidator,
  getSingleShipmentValidator,
  cancelShipmentValidator,
} from '#validations/shipment.js';

const router = express.Router();
// CREATE SHIPMENT
router.post('/createShipment', createShipmentValidator, checkLanguage, authMiddleware, createShipment);

// GET ALL SHIPMENT
router.get(
  '/getAllShipments',
  getShipmentValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getAllShipments
);

// WEBHOOK FOR AYMAKAN
router.post('/ayMakanWebHook', ayMakanWebHookValidator, webHookAuthMiddleware, ayMakanWebHook);

// GET SINGLE SHIPMENT
router.get('/getSingleShipment/:id', getSingleShipmentValidator, checkLanguage, authMiddleware, getSingleShipment);

// CANCEL SHIPMENT
router.post('/cancelShipment', cancelShipmentValidator, checkLanguage, authMiddleware, cancelShipment);

export default router;
