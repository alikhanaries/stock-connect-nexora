import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import { createShipment, getAllShipments, ayMakanWebHook } from '#root/src/controllers/ShipmentController.js';
import { authMiddleware, verifySellerAccess, webHookAuthMiddleware } from '#middleware/index.js';
import { getShipmentValidator, createShipmentValidator, ayMakanWebHookValidator } from '#validations/shipment.js';

const router = express.Router();
// CREATE SHIPMENT
router.post('/createShipment', createShipmentValidator, checkLanguage,authMiddleware, createShipment);

// GET ALL SHIPMENT
router.get(
  '/getAllShipments',
  getShipmentValidator,
  checkLanguage,
  authMiddleware,
  verifySellerAccess,
  getAllShipments
);

router.post('/ayMakanWebHook', ayMakanWebHookValidator, webHookAuthMiddleware, ayMakanWebHook);

export default router;
