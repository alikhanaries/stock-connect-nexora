import express from 'express';
import { getAllReturns, syncReturns } from '#controllers/ReturnController.js';
import { createMerchantReturn } from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import { getAllReturnsValidator, syncReturnsValidator } from '#validations/return.js';
import { validateReturn } from '#validations/return.js';

const router = express.Router();

// Get returns (supports ?source=database or ?source=channelengine)
router.get('/', getAllReturnsValidator, checkLanguage, authMiddleware, getAllReturns);

// Sync returns from ChannelEngine to database
router.get('/sync', syncReturnsValidator, checkLanguage, authMiddleware, syncReturns);

// Create a new return
router.post('/create', validateReturn, checkLanguage, authMiddleware, createMerchantReturn);

export default router;
