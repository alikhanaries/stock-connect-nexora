import express from 'express';
import { authMiddleware } from '#root/src/middleware/authMiddleware.js';
import { verifySellerAccess } from '#root/src/middleware/verifySellerAccessMiddleware.js';
import { fetchProductCount } from '#root/src/integrations/erp/unicommerce/controllers/productController.js';

const UniCommerceRouter = express.Router();
UniCommerceRouter.get('/productsCount', authMiddleware, verifySellerAccess, fetchProductCount);

export default UniCommerceRouter;
