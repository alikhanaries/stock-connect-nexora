import express from 'express';
import { checkLanguage } from '#middleware/index.js';
import { createShipment } from '#root/src/controllers/ShipmentController.js';
import { authMiddleware } from '#middleware/index.js';

const router = express.Router();
router.post('/createShipment', checkLanguage, authMiddleware, createShipment);
export default router;
