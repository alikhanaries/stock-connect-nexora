import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import { createShipment, getAllShipments } from '#root/src/controllers/ShipmentController.js';
import { authMiddleware } from '#middleware/index.js';
import { getShipmentValidator, createShipmentValidator } from '#validations/shipment.js';

const router = express.Router();
// CREATE SHIPMENT
router.post('/createShipment', createShipmentValidator, checkLanguage, authMiddleware, createShipment);

// GET ALL SHIPMENT
router.get('/getAllShipments', getShipmentValidator, checkLanguage, authMiddleware, getAllShipments);
export default router;
