import express from 'express';
import { authMiddleware, checkLanguage, verifySellerAccess } from '#middleware/index.js';
import { startShopifySync, getShopifySyncStatus } from '#controllers/ShopifySyncController.js';

const shopifyRouter = express.Router();

shopifyRouter.post(
  '/sync',
  checkLanguage,
  authMiddleware,
  (req, res, next) => {
    if (!req.query.sellerId && req.body?.sellerId) {
      req.query.sellerId = req.body.sellerId;
    }
    next();
  },
  verifySellerAccess,
  startShopifySync
);
shopifyRouter.get('/sync/status', checkLanguage, authMiddleware, verifySellerAccess, getShopifySyncStatus);

export default shopifyRouter;
