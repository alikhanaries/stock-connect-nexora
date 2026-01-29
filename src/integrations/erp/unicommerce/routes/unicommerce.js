import express from 'express';
import { unicommerceAuthMiddleware } from '#root/src/integrations/erp/unicommerce/middleware/authMiddleware.js';
import { verifyUnicommerceSellerAccess } from '#root/src/integrations/erp/unicommerce/middleware/verifySellerAccessMiddleware.js';
import { fetchProductCount } from '#root/src/integrations/erp/unicommerce/controllers/productController.js';
import { login } from '#root/src/integrations/erp/unicommerce/controllers/authController.js';
import { loginValidator } from '#root/src/integrations/erp/unicommerce/validations/auth.js';
import { checkLanguage } from '#middleware/index.js';

const UniCommerceRouter = express.Router();

UniCommerceRouter.get('/productsCount', unicommerceAuthMiddleware, verifyUnicommerceSellerAccess, fetchProductCount);
UniCommerceRouter.post('/authToken', loginValidator, checkLanguage, login);

export default UniCommerceRouter;
