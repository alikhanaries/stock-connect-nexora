import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import { createShipment, getAllShipments, ayMakanWebHook } from '#root/src/controllers/ShipmentController.js';
import { authMiddleware, verifySellerAccess } from '#middleware/index.js';
import { getShipmentValidator, createShipmentValidator } from '#validations/shipment.js';

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

router.post('/web-hook', ayMakanWebHook);

export default router;
