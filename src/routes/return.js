import express from 'express';
import {
  getAllReturns,
  syncReturns,
  createMerchantReturn,
  getReturnStats,
  acknowledgeMerchantReturn,
  markReturnReceived,
} from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import {
  getAllReturnsValidator,
  syncReturnsValidator,
  returnValidator,
  validateReturnAck,
  validateMarkReturnReceived,
} from '#validations/return.js';

const router = express.Router();

// Get returns (supports ?source=database or ?source=channelengine)
router.get('/', getAllReturnsValidator, checkLanguage, authMiddleware, getAllReturns);
// Get return statistics grouped by status
router.get('/stats', checkLanguage, authMiddleware, getReturnStats);
// Sync returns from ChannelEngine to database
router.get('/sync', syncReturnsValidator, checkLanguage, authMiddleware, syncReturns);
// Create a new return
router.post('/create', returnValidator, checkLanguage, authMiddleware, createMerchantReturn);
// Acknowledge a return
router.post('/acknowledge', validateReturnAck, checkLanguage, authMiddleware, acknowledgeMerchantReturn);

router.put('/mark-received', validateMarkReturnReceived, checkLanguage, authMiddleware, markReturnReceived);

export default router;
