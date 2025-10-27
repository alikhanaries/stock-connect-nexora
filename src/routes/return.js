import express from 'express';
import {
  getAllReturns,
  syncReturns,
  createMerchantReturn,
  getReturnStats,
  acknowledgeMerchantReturn,
  updateReturn,
  getReturnById,
} from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import {
  getAllReturnsValidator,
  syncReturnsValidator,
  returnValidator,
  validateReturnAck,
  updateReturnValidator,
  getReturnByIdValidator,
  getReturnStatsValidator,
} from '#validations/return.js';

const router = express.Router();

// Get returns
router.get('/', getAllReturnsValidator, checkLanguage, authMiddleware, getAllReturns);
// Get return statistics grouped by status
router.get('/stats', getReturnStatsValidator, checkLanguage, authMiddleware, getReturnStats);
// Sync returns from ChannelEngine to database
router.get('/sync', syncReturnsValidator, checkLanguage, authMiddleware, syncReturns);
// Get a specific return by ID
router.get('/:id', getReturnByIdValidator, checkLanguage, authMiddleware, getReturnById);
// Create a new return
router.post('/create', returnValidator, checkLanguage, authMiddleware, createMerchantReturn);
// Acknowledge a return
router.post('/acknowledge', validateReturnAck, checkLanguage, authMiddleware, acknowledgeMerchantReturn);

// Update return status (status will update to received)
router.put('/update', updateReturnValidator, checkLanguage, authMiddleware, updateReturn);

export default router;
