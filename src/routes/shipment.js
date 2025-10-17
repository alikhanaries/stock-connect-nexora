import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import { createShipment, getAllShipments, getSingleShipment } from '#root/src/controllers/ShipmentController.js';
import { authMiddleware, verifySellerAccess } from '#middleware/index.js';
import { getShipmentValidator, createShipmentValidator, getSingleShipmentValidator } from '#validations/shipment.js';

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

// GET SINGLE SHIPMENT
router.get('/getSingleShipment/:id', getSingleShipmentValidator, checkLanguage, authMiddleware, getSingleShipment);
export default router;
