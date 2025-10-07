import express from 'express';
import { getAllReturns, syncReturns } from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';
import { getAllReturnsValidator, syncReturnsValidator } from '#validations/return.js';

const router = express.Router();

// Get returns (supports ?source=database or ?source=channelengine)
router.get('/', getAllReturnsValidator, checkLanguage, authMiddleware, getAllReturns);

// Sync returns from ChannelEngine to database
router.get('/sync', syncReturnsValidator, checkLanguage, authMiddleware, syncReturns);

export default router;
