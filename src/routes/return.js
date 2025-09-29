import express from 'express';
import { getAllReturns, syncReturns } from '#controllers/ReturnController.js';
import { authMiddleware, checkLanguage } from '#middleware/index.js';

const router = express.Router();

// Get returns (supports ?source=database or ?source=channelengine)
router.get('/', authMiddleware, checkLanguage, getAllReturns);

// Sync returns from ChannelEngine to database
router.get('/sync', authMiddleware, checkLanguage, syncReturns);

export default router;
