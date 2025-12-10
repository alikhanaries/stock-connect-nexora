import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';
import express from 'express';
import { syncElliteStringStock } from '../controllers/ProductController.js';

const router = express.Router();

router.get('/sync', authMiddleware, verifySellerAccess, syncElliteStringStock);

export default router;
